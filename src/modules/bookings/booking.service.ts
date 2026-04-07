import { supabase } from '../../config/database';
import { parseTimeString, createISOTimestamp } from '../../shared/utils/date.utils';
import { BookingDetails } from './booking.types';
import { promotionService } from '../promotions/promotion.service';
import { CapacityHoldService } from './capacity-hold.service';
import { MembershipService } from '../memberships/membership.service';
import { logger } from '../../shared/utils/logger';

// Sub-service imports (facade delegates)
import { BookingCancelService } from './booking-cancel.service';
import { BookingEmployeeService } from './booking-employee.service';
import { BookingExtensionService } from './booking-extension.service';
import { SpaceService } from '../spaces/space.service';

export class BookingService {
  private capacityHoldService = new CapacityHoldService();
  private cancelService = new BookingCancelService();
  private employeeService = new BookingEmployeeService();
  private extensionService = new BookingExtensionService();

  // =====================================================
  // CORE BOOKING QUERIES
  // =====================================================

  async getBookingLocationId(bookingId: string): Promise<string | null> {
    const { data } = await supabase
      .from('bookings')
      .select('location_id')
      .eq('id', bookingId)
      .single();
    return data?.location_id ?? null;
  }

  async getBookingUserId(bookingId: string): Promise<string | null> {
    const { data } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('id', bookingId)
      .single();
    return data?.user_id ?? null;
  }

  async reserveBooking(bookingData: BookingDetails) {
    const {
      locationId,
      userId,
      spaceId,
      date,
      startTime,
      endTime,
      partySize,
      totalAmount
    } = bookingData;

    // Basic validation
    if (!locationId || !userId || !spaceId || !date || !startTime || !endTime || !partySize || totalAmount == null) {
      throw new Error('Missing required booking details');
    }

    // First, get the location's timezone
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('timezone')
      .eq('id', locationId)
      .single();

    if (locationError || !location) {
      logger.error({ err: locationError }, 'Error fetching location timezone');
      throw new Error('Invalid location ID');
    }

    const timezone = location.timezone || 'America/New_York';

    // Validate that start and end times are on the same day
    const startTimeParsed = parseTimeString(startTime);
    const endTimeParsed = parseTimeString(endTime);

    // If end time is earlier than start time, it suggests an overnight booking
    if (endTimeParsed.hours < startTimeParsed.hours ||
        (endTimeParsed.hours === startTimeParsed.hours && endTimeParsed.minutes < startTimeParsed.minutes)) {
      throw new Error('Overnight bookings are not allowed. Please book within a single day (12am to 11:59pm).');
    }

    const p_start_time = createISOTimestamp(date, startTime, timezone);
    const p_end_time = createISOTimestamp(date, endTime, timezone);

    logger.info({ timezone, date, startTime, endTime, p_start_time, p_end_time }, 'Creating booking');

    // Fetch location settings (needed for booking rules + reservation timeout)
    const membershipService = new MembershipService();
    const locationSettings = await membershipService.getLocationMembershipSettings(locationId);

    // Enforce booking window and available hours based on membership
    try {

      // Only look up membership benefits if memberships are enabled at this location
      const membership = locationSettings.membershipsEnabled
        ? await membershipService.getActiveMembershipForUser(userId, locationId)
        : null;
      const benefits = membership?.benefits;

      // Booking window enforcement: how far in advance can this user book?
      const bookingWindowDays = benefits?.bookingWindowDays ?? locationSettings.defaultBookingWindowDays;
      const bookingStartDate = new Date(p_start_time);
      const maxBookableDate = new Date();
      maxBookableDate.setDate(maxBookableDate.getDate() + bookingWindowDays);

      if (bookingStartDate > maxBookableDate) {
        const windowLabel = membership ? `${bookingWindowDays} days (member)` : `${bookingWindowDays} days`;
        throw new Error(`Bookings can only be made up to ${windowLabel} in advance.`);
      }

      // Available hours enforcement: members with extended hours bypass, everyone else uses location defaults
      if (locationSettings.defaultBookingHours && !membership) {
        const { start: allowedStart, end: allowedEnd } = locationSettings.defaultBookingHours;
        const [allowedStartH] = allowedStart.split(':').map(Number);
        const [allowedEndH] = allowedEnd.split(':').map(Number);

        const bookingLocalHour = parseInt(
          bookingStartDate.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: timezone })
        );

        const isOutsideHours = allowedEndH > allowedStartH
          ? (bookingLocalHour < allowedStartH || bookingLocalHour >= allowedEndH)
          : (bookingLocalHour < allowedStartH && bookingLocalHour >= allowedEndH);

        if (isOutsideHours) {
          throw new Error(`Bookings are only available between ${allowedStart} and ${allowedEnd}.`);
        }
      }
    } catch (membershipErr: any) {
      if (membershipErr.message?.includes('Bookings can only') || membershipErr.message?.includes('Non-member bookings')) {
        throw membershipErr;
      }
      logger.error({ err: membershipErr }, 'Error checking membership for booking rules');
      // Non-fatal for other errors: allow the booking to proceed
    }

    // Check capacity holds before proceeding
    // Convert 12h time (e.g. "6:00 PM") to 24h (e.g. "18:00") for hold comparison
    const start24 = `${String(startTimeParsed.hours).padStart(2, '0')}:${String(startTimeParsed.minutes).padStart(2, '0')}`;
    const end24 = `${String(endTimeParsed.hours).padStart(2, '0')}:${String(endTimeParsed.minutes).padStart(2, '0')}`;

    // Get total spaces at this location for capacity calculations
    const { data: spacesData } = await supabase
      .from('spaces')
      .select('id')
      .eq('location_id', locationId)
      .neq('status', 'closed');
    const totalSpaces = spacesData?.length || 0;

    // Count existing non-league bookings in this window for capacity hold enforcement
    const { count: existingBookingsInWindow } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', locationId)
      .in('status', ['confirmed', 'reserved'])
      .lt('start_time', p_end_time)
      .gt('end_time', p_start_time);

    const holdConflict = await this.capacityHoldService.checkHoldConflict(
      locationId, date, start24, end24, totalSpaces, existingBookingsInWindow ?? 0
    );
    if (holdConflict) {
      const leagueName = holdConflict.league_name || 'League Night';
      throw new Error(`This time is reserved for ${leagueName}. Please choose a different time.`);
    }

    // Check space closures
    const spaceService = new SpaceService();
    const isClosed = await spaceService.getActiveClosuresForSlot(spaceId, date, start24, end24);
    if (isClosed) {
      throw new Error('This space is closed during the selected time. Please choose a different space or time.');
    }

    // Check if reservation holds are enabled for this location
    const reservationTimeoutMinutes = locationSettings.reservationTimeoutMinutes;
    const reservationsEnabled = reservationTimeoutMinutes !== null && reservationTimeoutMinutes > 0;

    // Generate a temporary payment intent ID for the reservation
    const tempPaymentIntentId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Call the PostgreSQL function to create booking and all related records
    const { data, error } = await supabase.rpc('create_booking_and_payment_record', {
      p_location_id: locationId,
      p_user_id: userId,
      p_space_id: spaceId,
      p_start_time: p_start_time,
      p_end_time: p_end_time,
      p_party_size: partySize,
      p_total_amount: totalAmount,
      p_payment_intent_id: tempPaymentIntentId,
      p_user_agent: 'API',
      p_ip_address: '0.0.0.0',
      p_reservation_timeout_minutes: reservationsEnabled ? reservationTimeoutMinutes : null,
    });

    if (error) {
      logger.error({ err: error }, 'Error calling create_booking_and_payment_record function');
      if (error.message?.includes('duplicate key') || error.message?.includes('already exists') || error.message?.includes('Time slot is already booked')) {
        throw new Error('This time slot is no longer available.');
      }
      throw error;
    }

    // Function returns JSONB with { booking_id, expires_at }
    if (!data?.booking_id) {
      throw new Error('Failed to create booking - no booking ID returned');
    }

    // Use the authoritative expires_at from the DB (avoids clock skew with client-side computation)
    const expiresAt = data.expires_at ?? null;

    logger.info({ bookingId: data.booking_id, spaceId, p_start_time, p_end_time, reservationsEnabled, expiresAt }, 'Created new booking');

    // Auto-associate user with this location (idempotent upsert)
    await supabase
      .from('user_locations')
      .upsert({ user_id: userId, location_id: locationId }, { onConflict: 'user_id,location_id' })
      .then(({ error: ulErr }) => {
        if (ulErr) logger.warn({ err: ulErr, userId, locationId }, 'Failed to upsert user_locations (non-critical)');
      });

    return {
      bookingId: data.booking_id,
      expiresAt,
      reservationTimeoutMinutes: reservationsEnabled ? reservationTimeoutMinutes : null,
    };
  }

  async checkSlotAvailability(bookingId: string): Promise<boolean> {
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('space_id, location_id, start_time, end_time')
      .eq('id', bookingId)
      .single();

    if (error || !booking) return false;

    // Check for any confirmed or active reserved booking in the same slot
    const now = new Date().toISOString();
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id, status, expires_at')
      .eq('space_id', booking.space_id)
      .eq('location_id', booking.location_id)
      .lt('start_time', booking.end_time)
      .gt('end_time', booking.start_time)
      .in('status', ['confirmed', 'reserved'])
      .neq('id', bookingId);

    if (!conflicts || conflicts.length === 0) return true;

    // Filter out expired reservations
    const activeConflicts = conflicts.filter(c => {
      if (c.status === 'reserved' && c.expires_at && c.expires_at < now) return false;
      return true;
    });

    return activeConflicts.length === 0;
  }

  async getBookings(locationId: string, date: string, startTime?: string) {
    if (!locationId || !date) {
      throw new Error('locationId and date are required parameters');
    }

    // First, get the location's timezone
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('timezone')
      .eq('id', locationId)
      .single();

    if (locationError || !location) {
      logger.error({ err: locationError }, 'Error fetching location timezone');
      throw new Error('Invalid location ID');
    }

    const timezone = location.timezone || 'America/New_York';

    // For date range, always use start of day for the lower bound of start_time
    const startOfDayUTC = createISOTimestamp(date, '12:00 AM', timezone);

    // For end of day, use 11:59:59 PM to stay within the same day
    const endOfDayUTC = createISOTimestamp(date, '11:59 PM', timezone);

    // Add one minute to include 11:59 PM bookings but exclude midnight of next day
    const endOfDayPlusOneMinute = new Date(new Date(endOfDayUTC).getTime() + 60000).toISOString();

    // If startTime is provided (for "today" views), we need to filter out bookings that have already ended
    const filterEndTimeAfter = startTime ? createISOTimestamp(date, startTime, timezone) : null;

    logger.info({ date, timezone, startUTC: startOfDayUTC, endUTC: endOfDayPlusOneMinute, filterEndTimeAfter }, 'Fetching bookings');

    // Query bookings that OVERLAP with this date:
    // Either start_time falls on this date, OR the booking spans midnight and
    // end_time falls on this date (cross-midnight bookings from extensions)
    let query = supabase
      .from('bookings')
      .select('id, space_id, user_id, start_time, end_time, status, expires_at')
      .eq('location_id', locationId)
      .lt('start_time', endOfDayPlusOneMinute)
      .gt('end_time', startOfDayUTC)
      .neq('status', 'cancelled')
      .neq('status', 'expired')
      .neq('status', 'abandoned');

    // If startTime filter is provided, only include bookings that END after that time
    if (filterEndTimeAfter) {
      query = query.gt('end_time', filterEndTimeAfter);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ err: error }, 'Error fetching bookings');
      throw new Error('Failed to fetch bookings');
    }

    // Filter out bookings that shouldn't block the timetable:
    // - Reserved bookings whose hold has expired
    // - Pending bookings with no expires_at (reservation holds off — slot not held during checkout)
    const now = new Date().toISOString();
    const activeBookings = data.filter(booking => {
      if (booking.status === 'reserved' && booking.expires_at && booking.expires_at < now) {
        return false;
      }
      if (booking.status === 'pending' && !booking.expires_at) {
        return false;
      }
      return true;
    });

    // Convert UTC timestamps to local time strings for the frontend time grid.
    // The grid uses 15-min slots from "12:00 AM" to "11:59 PM" (96 slots).
    // Cross-midnight bookings are clamped to the queried date and times are
    // snapped to slot boundaries so `timeToIndex` always finds a match.

    const dayStartMs = new Date(startOfDayUTC).getTime();
    const dayEndMs = new Date(endOfDayUTC).getTime();       // 11:59 PM local
    const dayMidnightMs = new Date(endOfDayPlusOneMinute).getTime(); // next midnight

    // Convert a UTC ms instant to minutes-since-midnight in the location's timezone
    const toLocalMinutes = (ms: number): number => {
      const d = new Date(ms);
      const h = parseInt(d.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: timezone }));
      const m = parseInt(d.toLocaleString('en-US', { minute: '2-digit', timeZone: timezone }));
      return h * 60 + m;
    };

    // Format minutes-since-midnight to "h:mm AM/PM"
    const minutesToTimeStr = (mins: number): string => {
      const h24 = Math.floor(mins / 60) % 24;
      const m = mins % 60;
      const h12 = h24 % 12 || 12;
      const period = h24 < 12 ? 'AM' : 'PM';
      return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
    };

    const SLOT = 15; // minutes per grid slot

    const formattedBookings = activeBookings.map(booking => {
      const rawStartMs = new Date(booking.start_time).getTime();
      const rawEndMs = new Date(booking.end_time).getTime();

      // Clamp to the queried day's boundaries
      const clampedStartMs = Math.max(rawStartMs, dayStartMs);
      const clampedEndMs = Math.min(rawEndMs, dayMidnightMs);

      let startMin = toLocalMinutes(clampedStartMs);
      let endMin = toLocalMinutes(clampedEndMs);

      // Snap start DOWN to nearest slot boundary
      startMin = Math.floor(startMin / SLOT) * SLOT;

      // Snap end UP to nearest slot boundary (unless it's already at end-of-day)
      if (clampedEndMs >= dayMidnightMs) {
        // Booking extends to or past midnight — use "11:59 PM" (grid end marker)
        return {
          id: booking.id,
          spaceId: booking.space_id,
          userId: booking.user_id,
          startTime: minutesToTimeStr(startMin),
          endTime: '11:59 PM',
          startTimeISO: booking.start_time,
          endTimeISO: booking.end_time
        };
      }

      if (endMin % SLOT !== 0) {
        endMin = Math.ceil(endMin / SLOT) * SLOT;
      }
      // Handle end snapping past midnight (e.g. 23:50 snaps to 24:00 = 0)
      if (endMin >= 1440) endMin = 1440;

      return {
        id: booking.id,
        spaceId: booking.space_id,
        userId: booking.user_id,
        startTime: minutesToTimeStr(startMin),
        endTime: endMin >= 1440 ? '11:59 PM' : minutesToTimeStr(endMin),
        startTimeISO: booking.start_time,
        endTimeISO: booking.end_time
      };
    });

    return formattedBookings;
  }

  async getUserReservedBookings(userId: string) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, total_amount, status, expires_at, space_id, location_id, spaces (name, space_number)')
      .eq('user_id', userId)
      .eq('status', 'reserved')
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      logger.error({ err: error }, 'Error fetching reserved user bookings');
      throw new Error('Failed to fetch reserved user bookings');
    }

    if (!data || data.length === 0) {
      return { reservation: null };
    }

    const reservation = data[0];
    const formattedReservation = {
      id: reservation.id,
      startTime: reservation.start_time,
      endTime: reservation.end_time,
      totalAmount: reservation.total_amount,
      status: reservation.status,
      expiresAt: reservation.expires_at,
      spaceId: reservation.space_id,
      locationId: reservation.location_id,
      spaceName: (reservation.spaces as any)?.name || 'N/A',
      spaceNumber: (reservation.spaces as any)?.space_number || 'N/A'
    };

    return { reservation: formattedReservation };
  }

  async getUserFutureBookings(userId: string) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, total_amount, status, spaces (name, space_number)')
      .eq('user_id', userId)
      .gte('end_time', now)
      .not('status', 'in', '("reserved","expired","abandoned","cancelled")')
      .order('start_time', { ascending: true });

    if (error) {
      logger.error({ err: error }, 'Error fetching future user bookings');
      throw new Error('Failed to fetch future user bookings');
    }

    const formattedBookings = data.map((booking: any) => ({
      id: booking.id,
      startTime: booking.start_time,
      endTime: booking.end_time,
      totalAmount: booking.total_amount,
      status: booking.status,
      spaceName: booking.spaces?.name || 'N/A',
      spaceNumber: booking.spaces?.space_number || 'N/A'
    }));

    return formattedBookings;
  }

  async getUserPastBookings(userId: string, page = 1, pageSize = 20) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const cappedPageSize = Math.min(pageSize, 50);
    const from = (page - 1) * cappedPageSize;
    const to = from + cappedPageSize - 1;

    const now = new Date().toISOString();

    // Include bookings that have ended OR that were cancelled (even if their end_time is in the future)
    const { data, error, count } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, total_amount, status, spaces (name, space_number)', { count: 'exact' })
      .eq('user_id', userId)
      .not('status', 'in', '("abandoned","reserved","expired")')
      .or(`end_time.lt.${now},status.eq.cancelled`)
      .order('start_time', { ascending: false })
      .range(from, to);

    if (error) {
      logger.error({ err: error }, 'Error fetching past user bookings');
      throw new Error('Failed to fetch past user bookings');
    }

    const formattedBookings = (data || []).map((booking: any) => ({
      id: booking.id,
      startTime: booking.start_time,
      endTime: booking.end_time,
      totalAmount: booking.total_amount,
      status: booking.status,
      spaceName: booking.spaces?.name || 'N/A',
      spaceNumber: booking.spaces?.space_number || 'N/A'
    }));

    return { data: formattedBookings, total: count || 0, page, pageSize: cappedPageSize };
  }

  // =====================================================
  // PROMOTION HELPERS
  // =====================================================

  async applyPromotionToBooking(
    bookingId: string,
    userId: string,
    promotionId: string,
    discountAmount: number,
    freeMinutes?: number
  ) {
    try {
      const success = await promotionService.applyPromotion({
        userId,
        bookingId,
        promotionId,
        discountAmount,
        freeMinutes
      });

      if (success) {
        logger.info({ promotionId, bookingId }, 'Successfully applied promotion to booking');
      }

      return success;
    } catch (error) {
      logger.error({ err: error, bookingId }, 'Error applying promotion to booking');
      return false;
    }
  }

  async getBookingDiscountInfo(
    userId: string,
    locationId: string,
    bookingMinutes: number,
    originalAmount: number,
    hourlyRate?: number
  ) {
    return promotionService.calculateDiscountSimple(
      userId,
      locationId,
      bookingMinutes,
      originalAmount,
      hourlyRate
    );
  }

  // =====================================================
  // DELEGATED METHODS — Cancellation
  // =====================================================

  async cancelBooking(bookingId: string, userId: string) {
    return this.cancelService.cancelBooking(bookingId, userId);
  }

  async employeeCancelBooking(bookingId: string, employeeId: string, reason?: string, skipRefund = false) {
    return this.cancelService.employeeCancelBooking(bookingId, employeeId, reason, skipRefund);
  }

  async cancelReservedBooking(bookingId: string, userId: string) {
    return this.cancelService.cancelReservedBooking(bookingId, userId);
  }

  // =====================================================
  // DELEGATED METHODS — Employee Operations
  // =====================================================

  async getAllBookingsForEmployee(locationId: string, startDate?: string, endDate?: string, spaceId?: string, customerEmail?: string) {
    return this.employeeService.getAllBookingsForEmployee(locationId, startDate, endDate, spaceId, customerEmail);
  }

  async searchCustomersByEmail(email: string, locationId: string) {
    return this.employeeService.searchCustomersByEmail(email, locationId);
  }

  async createEmployeeBooking(bookingData: Parameters<BookingEmployeeService['createEmployeeBooking']>[0], employeeId: string) {
    return this.employeeService.createEmployeeBooking(bookingData, employeeId);
  }

  async employeeRescheduleBooking(
    bookingId: string,
    newStartTime: string,
    newEndTime: string,
    locationId: string,
    spaceId: string,
    employeeId: string,
    adjustPrice: boolean = false
  ) {
    return this.employeeService.employeeRescheduleBooking(bookingId, newStartTime, newEndTime, locationId, spaceId, employeeId, adjustPrice);
  }

  // =====================================================
  // DELEGATED METHODS — Session Extensions
  // =====================================================

  async getExtensionOptions(bookingId: string, requestedOptions?: number[]) {
    return this.extensionService.getExtensionOptions(bookingId, requestedOptions);
  }

  async extendBooking(bookingId: string, extensionMinutes: number, locationId: string, spaceId: string, useFreeMinutes = false) {
    return this.extensionService.extendBooking(bookingId, extensionMinutes, locationId, spaceId, useFreeMinutes);
  }

  async employeeExtendBooking(
    bookingId: string,
    extensionMinutes: number,
    locationId: string,
    spaceId: string,
    employeeId: string,
    skipPayment: boolean = false
  ) {
    return this.extensionService.employeeExtendBooking(bookingId, extensionMinutes, locationId, spaceId, employeeId, skipPayment);
  }
}

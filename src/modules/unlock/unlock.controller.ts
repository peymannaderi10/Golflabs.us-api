import { Request, Response } from 'express';
import { SocketService } from '../sockets/socket.service';
import { supabase } from '../../config/database';
import { verifyUnlockToken } from '../../shared/utils/token.utils';
import { sanitizeError } from '../../shared/utils/error.utils';
import { logger } from '../../shared/utils/logger';
import { LocationService } from '../locations/location.service';

export class UnlockController {
  private socketService: SocketService;

  constructor(socketService: SocketService) {
    this.socketService = socketService;
  }

  /**
   * Employee unlock - tries each space at a location until one responds successfully
   */
  employeeUnlock = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.body;

      if (!locationId) {
        return res.status(400).json({ error: 'locationId is required' });
      }

      const doorLockType = await LocationService.getDoorLockType(locationId);
      if (doorLockType === 'none') {
        return res.status(400).json({ error: 'This location does not have an automated door lock.' });
      }

      // Get all available spaces for the location
      const { data: spaces, error: spacesError } = await supabase
        .from('spaces')
        .select('id, name, space_number, status')
        .eq('location_id', locationId)
        .eq('status', 'available')
        .order('space_number', { ascending: true });

      if (spacesError) {
        logger.error({ err: spacesError }, 'Error fetching spaces');
        return res.status(500).json({ error: 'Failed to fetch spaces' });
      }

      if (!spaces || spaces.length === 0) {
        return res.status(404).json({ error: 'No available spaces found for this location' });
      }

      // Extract IP address and user agent for logging
      const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
      const userAgent = req.get('User-Agent') || 'Unknown';
      const employeeId = (req as any).user?.id || 'unknown';

      // Try each space until one successfully responds
      for (const space of spaces) {
        logger.info({ spaceName: space.name, spaceId: space.id }, 'Attempting employee unlock on space');

        const unlockSuccessful = await this.socketService.sendUnlockCommand(
          locationId,
          space.id,
          5, // 5 seconds unlock duration
          `employee-unlock` // Not a real booking -- access log is created separately with booking_id: null
        );

        if (unlockSuccessful) {
          // Log the successful unlock
          await supabase.from('access_logs').insert({
            location_id: locationId,
            space_id: space.id,
            booking_id: null,
            user_id: employeeId,
            action: 'employee_door_unlock',
            success: true,
            ip_address: ipAddress,
            user_agent: userAgent,
            unlock_method: 'employee_dashboard',
            metadata: {
              space_name: space.name,
              space_number: space.space_number
            }
          });

          logger.info({ spaceName: space.name }, 'Employee unlock successful on space');
          return res.json({
            success: true,
            message: `Door unlocked successfully via ${space.name}`,
            spaceId: space.id,
            spaceName: space.name
          });
        }
      }

      // If no space responded successfully
      logger.error({ locationId }, 'Employee unlock failed - no kiosk responded');
      return res.status(503).json({
        success: false,
        error: 'No kiosk responded to the unlock command. Please ensure at least one kiosk is online.'
      });

    } catch (error: any) {
      logger.error({ err: error }, 'Error in employee unlock');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  unlockDoor = async (req: Request, res: Response) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Token is required' });
      }

      const tokenData = verifyUnlockToken(token);
      if (!tokenData) {
        return res.status(400).json({ error: 'Invalid or tampered token' });
      }

      const { bookingId, expires } = tokenData;

      if (Date.now() > expires) {
        return res.status(403).json({ error: 'Token has expired' });
      }

      // Verify booking exists and is confirmed
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('id, status, space_id, location_id, user_id, start_time, end_time')
        .eq('id', bookingId)
        .single();

      if (bookingError || !booking) {
        logger.error({ err: bookingError, bookingId }, 'Booking not found');
        return res.status(404).json({ error: 'Booking not found' });
      }

      if (booking.status !== 'confirmed') {
        logger.info({ bookingId, status: booking.status }, 'Booking has invalid status for unlock');
        return res.status(403).json({ error: 'Booking is not confirmed' });
      }

      const doorLockType = await LocationService.getDoorLockType(booking.location_id);
      if (doorLockType === 'none') {
        return res.status(400).json({ error: 'This location does not have an automated door lock.' });
      }

      // Check if booking is currently active (within the time window)
      const now = new Date();
      const bookingStart = new Date(booking.start_time);
      const bookingEnd = new Date(booking.end_time);

      // Allow unlock 15 minutes before start time and up to end time
      const unlockWindow = new Date(bookingStart.getTime() - 15 * 60 * 1000);
      
      if (now < unlockWindow) {
        return res.status(403).json({ 
          error: 'Too early to unlock. Access available 15 minutes before your booking time.',
          earliestAccess: unlockWindow.toISOString()
        });
      }

      if (now > bookingEnd) {
        return res.status(403).json({ 
          error: 'Booking has ended. Access no longer available.',
          bookingEnded: bookingEnd.toISOString()
        });
      }

      // Extract IP address and user agent
      const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
      const userAgent = req.get('User-Agent') || 'Unknown';

      // Log the unlock attempt
      const { error: logError } = await supabase
        .from('access_logs')
        .insert({
          location_id: booking.location_id,
          space_id: booking.space_id,
          booking_id: bookingId,
          user_id: booking.user_id,
          action: 'door_unlock_button_pressed',
          success: true,
          ip_address: ipAddress,
          user_agent: userAgent,
          unlock_method: 'email_link',
          unlock_token_used: token.slice(-8), // Last 8 characters for debugging
          metadata: {
            unlock_window_start: unlockWindow.toISOString(),
            booking_start: booking.start_time,
            booking_end: booking.end_time
          }
        });

      if (logError) {
        logger.error({ err: logError }, 'Error logging unlock attempt');
        // Don't fail the request, just log the error
      }

      // Send unlock command to kiosk via websocket
      const unlockSuccessful = await this.socketService.sendUnlockCommand(
        booking.location_id,
        booking.space_id,
        5, // 5 seconds unlock duration
        bookingId
      );

      if (!unlockSuccessful) {
        logger.error({ bookingId }, 'Unlock failed - kiosk did not confirm');
        
        // Log the failure
        await supabase.from('access_logs').insert({
          location_id: booking.location_id,
          space_id: booking.space_id,
          booking_id: bookingId,
          user_id: booking.user_id,
          action: 'door_unlock_failure',
          success: false,
          error_message: 'Kiosk did not respond or reported failure',
          ip_address: ipAddress,
          user_agent: userAgent,
          unlock_method: 'email_link',
          unlock_token_used: token.slice(-8)
        });

        return res.status(503).json({ 
          success: false,
          error: 'The door unlock system is currently offline or the lock is unreachable. Please try again in a moment. If the problem persists, please contact support.' 
        });
      }

      logger.info({ bookingId }, 'Door unlock command acknowledged as successful');
      
      res.json({
        success: true,
        message: 'Access granted! The door is now unlocked.',
        bookingId,
        unlockDuration: 5
      });

    } catch (error: any) {
      logger.error({ err: error }, 'Error in unlock door');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };
} 
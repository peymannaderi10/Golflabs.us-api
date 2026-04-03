export interface Promotion {
  id: string;
  location_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  discount_type: 'fixed' | 'percentage' | 'free_minutes';
  discount_value: number;
  max_discount_amount: number | null;
  min_booking_minutes: number | null;
  max_free_minutes: number | null;
  is_auto_assigned: boolean;
  is_single_use: boolean;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePromotionRequest {
  locationId: string;
  name: string;
  code?: string;
  description?: string;
  discountType: 'fixed' | 'percentage' | 'free_minutes';
  discountValue: number;
  maxDiscountAmount?: number;
  minBookingMinutes?: number;
  maxFreeMinutes?: number;
  isAutoAssigned: boolean;
  isSingleUse: boolean;
  validFrom?: string;
  validTo?: string;
}

export interface UpdatePromotionRequest {
  name?: string;
  code?: string;
  description?: string;
  discountType?: 'fixed' | 'percentage' | 'free_minutes';
  discountValue?: number;
  maxDiscountAmount?: number | null;
  minBookingMinutes?: number | null;
  maxFreeMinutes?: number | null;
  isAutoAssigned?: boolean;
  isSingleUse?: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  isActive?: boolean;
}

export interface PromotionUsageStats {
  totalAssigned: number;
  totalRedeemed: number;
  totalDiscountGiven: number;
  recentUsage: Array<{
    userId: string;
    fullName: string;
    email: string;
    redeemedAt: string;
    discountApplied: number | null;
    freeMinutesApplied: number | null;
    bookingId: string | null;
  }>;
}

export interface UserPromotion {
  id: string;
  user_id: string;
  promotion_id: string;
  assigned_at: string;
  redeemed_at: string | null;
  booking_id: string | null;
  discount_applied: number | null;
  free_minutes_applied: number | null;
  expires_at: string | null;
  created_at: string;
  // Joined data
  promotion?: Promotion;
}

export interface CalculatedDiscount {
  promotionId: string | null;
  promotionName: string | null;
  discountType: string | null;
  discountAmount: number;
  freeMinutes: number;
  finalAmount: number;
  originalAmount: number;
}

export interface ApplyPromotionRequest {
  userId: string;
  bookingId: string;
  promotionId: string;
  discountAmount: number;
  freeMinutes?: number;
}

export interface CheckDiscountRequest {
  userId: string;
  bookingMinutes: number;
  originalAmount: number;
  hourlyRate?: number;
}

export interface CheckDiscountWithTimesRequest {
  userId: string;
  locationId: string;
  date: string;        // YYYY-MM-DD format
  startTime: string;   // "12:00 PM" format
  endTime: string;     // "1:00 PM" format
  originalAmount: number;
}


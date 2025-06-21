export interface BookingDetails {
  date: string;
  bayId: string; // Should be UUID
  startTime: string;
  endTime: string;
  partySize: number;
  userId: string; // Should be UUID
  locationId: string; // Should be UUID
  totalAmount: number; // Add total amount
}

export interface CreatePaymentForBookingBody {
  amount: number; // in cents
}

export interface PricingRule {
  name: string;
  hourlyRate: number;
  startTime: string;
  endTime: string;
  daysOfWeek: string;
}

export interface UpdatePaymentIntentRequest {
  paymentIntentId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
} 
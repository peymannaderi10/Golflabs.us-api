export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface BookingEmailData {
  userFullName: string;
  userEmail: string;
  bookingId: string;
  bayName: string;
  locationName: string;
  locationTimezone: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  unlockToken?: string;
  unlockLink?: string;
  // Cancellation-specific data
  cancellationReason?: string;
  cancelledBy?: 'customer' | 'employee';
  refundAmount?: number;
  refundProcessed?: boolean;
}

export interface NotificationRecord {
  id: string;
  location_id: string;
  user_id: string;
  booking_id: string;
  type: 'thank_you' | 'reminder' | 'cancellation' | 'confirmation';
  channel: 'email' | 'sms';
  recipient: string;
  subject: string;
  content: string;
  status: 'pending' | 'sent' | 'failed' | 'delivered' | 'bounced';
  sent_at?: string;
  delivered_at?: string;
  error_message?: string;
  resend_message_id?: string;
  resend_status?: string;
  metadata?: Record<string, any>;
}

export interface ResendWebhookEvent {
  type: 'email.sent' | 'email.delivered' | 'email.bounced' | 'email.complained';
  created_at: string;
  data: {
    message_id: string;
    to: string[];
    from: string;
    subject: string;
    created_at: string;
    email_id?: string;
  };
}

export interface CreateNotificationParams {
  locationId: string;
  userId: string;
  bookingId: string;
  type: NotificationRecord['type'];
  recipient: string;
  subject: string;
  content: string;
  scheduledFor?: Date;
  metadata?: Record<string, any>;
} 
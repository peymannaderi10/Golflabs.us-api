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
  type: 'thank_you' | 'reminder' | 'cancellation' | 'confirmation' | 'post_booking_review' | 'booking_time_changed';
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
  type: 'email.sent' | 'email.delivered' | 'email.bounced' | 'email.complained' | 'email.opened' | 'email.clicked';
  created_at: string;
  data: {
    email_id: string;
    to: string[];
    from: string;
    subject: string;
    created_at: string;
    message_id?: string;
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

// =====================================================
// Team Invite Email Types
// =====================================================

export interface TeamInviteEmailData {
  invitedUserName: string;
  invitedEmail: string;
  captainName: string;
  teamName: string;
  leagueName: string;
  seasonFee: number;
  weeklyPrizePot: number;
  totalWeeks: number;
  numHoles: number;
  playersPerTeam: number;
  acceptUrl: string;
  declineUrl: string;
}

export interface TeamStatusEmailData {
  recipientName: string;
  recipientEmail: string;
  teamName: string;
  leagueName: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
}

// =====================================================
// Attendance Reminder Email Types
// =====================================================

export interface AttendanceReminderEmailData {
  playerName: string;
  playerEmail: string;
  leagueName: string;
  weekNumber: number;
  leagueDate: string;    // formatted date string e.g. "Tuesday, February 10"
  startTime: string;     // e.g. "7:00 PM"
  confirmUrl: string;
  declineUrl: string;
}

// =====================================================
// League Enrollment Confirmation Email Types
// =====================================================

export interface LeagueEnrollmentEmailData {
  playerName: string;
  playerEmail: string;
  leagueName: string;
  format: string;
  dayOfWeek: string;
  startTime: string;
  totalWeeks: number;
  seasonFee: number;
  prizePotTotal: number;
  totalPaid: number;
  startDate: string;
  dashboardUrl: string;
}

// =====================================================
// Membership Email Types
// =====================================================

export interface MembershipEmailData {
  userFullName: string;
  userEmail: string;
  planName: string;
  billingInterval: 'monthly' | 'annual';
  price: number;
  locationName: string;
  freeHoursPerMonth?: number;
  bookingWindowDays?: number;
  guestPassesPerMonth?: number;
  renewalDate?: string;
  refundAmount?: number;
  cancelType?: 'immediate' | 'end_of_period';
  accessUntil?: string;
}

// =====================================================
// DB-Driven Email Template Types
// =====================================================

export type EmailTemplateType =
  | 'booking_confirmation'
  | 'booking_reminder'
  | 'booking_cancellation'
  | 'team_invite'
  | 'team_status'
  | 'attendance_reminder'
  | 'enrollment_confirmation'
  | 'membership_welcome'
  | 'membership_canceled'
  | 'marketing_campaign'
  | 'post_booking_review'
  | 'booking_time_changed';

export interface EmailTemplateRecord {
  id: string;
  location_id: string | null;
  template_type: EmailTemplateType;
  name: string;
  subject_template: string;
  html_template: string;
  text_template: string | null;
  variables: string[];
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text?: string;
}
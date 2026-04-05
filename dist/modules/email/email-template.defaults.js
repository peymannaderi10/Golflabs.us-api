"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TEMPLATES = void 0;
function plain(title, content) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; padding: 32px 16px;">
    <div style="background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e4e4e7;">
      <div style="background-color: #18181b; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #ffffff; letter-spacing: 0.5px;">{{brandName}}</h1>
      </div>
      <div style="padding: 32px 24px;">
        ${content}
      </div>
      <div style="border-top: 1px solid #e4e4e7; padding: 20px 24px; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #a1a1aa;">{{brandName}}</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
function detailRow(label, value) {
    return `<div style="display: flex; padding: 10px 0; border-bottom: 1px solid #f4f4f5;">
    <span style="color: #71717a; font-weight: 500; min-width: 90px;">${label}</span>
    <span style="color: #18181b; font-weight: 500;">${value}</span>
  </div>`;
}
function detailCard(rows) {
    return `<div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">${rows}</div>`;
}
function btn(href, label, style = 'primary') {
    const bg = style === 'primary' ? 'background-color: #18181b; color: #ffffff;' : 'background-color: #ffffff; color: #52525b; border: 1px solid #d4d4d8;';
    return `<a href="${href}" style="display: inline-block; ${bg} padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; text-decoration: none;">${label}</a>`;
}
// ---------------------------------------------------------------------------
// Template map
// ---------------------------------------------------------------------------
exports.DEFAULT_TEMPLATES = {
    // =========================================================================
    // 1. BOOKING CONFIRMATION
    // =========================================================================
    booking_confirmation: {
        name: 'Booking Confirmation',
        subject: 'Booking confirmed — {{locationName}}',
        html: plain('Booking Confirmation', `
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #18181b;">Booking Confirmed</h2>
      <p style="margin: 0 0 20px; font-size: 15px; color: #52525b;">Thanks for booking, {{userFullName}}.</p>

      ${detailCard(detailRow('Location', '{{locationName}}') +
            detailRow('Space', '{{spaceName}}') +
            detailRow('Date', '{{startDate}}') +
            `<div style="display: flex; padding: 10px 0;">
          <span style="color: #71717a; font-weight: 500; min-width: 90px;">Time</span>
          <span style="color: #18181b; font-weight: 500;">{{startTime}} - {{endTime}}</span>
        </div>`)}

      {{#if hasDoorLock}}
      <p style="margin: 20px 0 0; font-size: 14px; color: #52525b;">You'll receive a reminder with your unlock link 15 minutes before your session.</p>
      {{else}}
      <p style="margin: 20px 0 0; font-size: 14px; color: #52525b;">Just show up and we'll take care of the rest.</p>
      {{/if}}
    `),
        text: `Booking Confirmed — {{brandName}}

Thanks for booking, {{userFullName}}.

Location: {{locationName}}
Space: {{spaceName}}
Date: {{startDate}}
Time: {{startTime}} - {{endTime}}

{{#if hasDoorLock}}You'll receive a reminder with your unlock link 15 minutes before your session.{{else}}Just show up and we'll take care of the rest.{{/if}}`,
        variables: ['userFullName', 'locationName', 'spaceName', 'startDate', 'startTime', 'endTime', 'hasDoorLock', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 2. BOOKING REMINDER
    // =========================================================================
    booking_reminder: {
        name: 'Booking Reminder',
        subject: 'Your session starts in 15 minutes — {{locationName}}',
        html: plain('Session Starting Soon', `
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #18181b;">Your Session Starts Soon</h2>
      <p style="margin: 0 0 20px; font-size: 15px; color: #52525b;">Hi {{userFullName}}, your session starts in 15 minutes.</p>

      ${detailCard(detailRow('Location', '{{locationName}}') +
            detailRow('Space', '{{spaceName}}') +
            detailRow('Date', '{{startDate}}') +
            `<div style="display: flex; padding: 10px 0;">
          <span style="color: #71717a; font-weight: 500; min-width: 90px;">Time</span>
          <span style="color: #18181b; font-weight: 500;">{{startTime}} - {{endTime}}</span>
        </div>`)}

      {{#if unlockLink}}
      <div style="text-align: center; margin: 28px 0;">
        ${btn('{{unlockLink}}', 'Unlock My Space')}
      </div>
      <p style="margin: 0; font-size: 13px; color: #a1a1aa; text-align: center;">Click when you arrive. This link expires when your session ends.</p>
      {{/if}}

      <p style="margin: 20px 0 0; font-size: 14px; color: #52525b;">Please arrive a few minutes early to get settled.</p>
    `),
        text: `Your Session Starts Soon — {{brandName}}

Hi {{userFullName}}, your session starts in 15 minutes.

Location: {{locationName}}
Space: {{spaceName}}
Date: {{startDate}}
Time: {{startTime}} - {{endTime}}

{{#if unlockLink}}Unlock your space: {{unlockLink}}
This link expires when your session ends.{{/if}}

Please arrive a few minutes early to get settled.`,
        variables: ['userFullName', 'locationName', 'spaceName', 'startDate', 'startTime', 'endTime', 'unlockLink', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 3. BOOKING CANCELLATION
    // =========================================================================
    booking_cancellation: {
        name: 'Booking Cancellation',
        subject: 'Booking cancelled — {{locationName}}',
        html: plain('Booking Cancelled', `
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #18181b;">Booking Cancelled</h2>
      <p style="margin: 0 0 20px; font-size: 15px; color: #52525b;">
        {{#if isCancelledByEmployee}}Your booking has been cancelled by staff.{{#if cancellationReason}} Reason: {{cancellationReason}}{{/if}}{{else}}Your cancellation has been processed, {{userFullName}}.{{/if}}
      </p>

      ${detailCard(detailRow('Location', '{{locationName}}') +
            detailRow('Space', '{{spaceName}}') +
            detailRow('Date', '{{startDate}}') +
            `<div style="display: flex; padding: 10px 0;">
          <span style="color: #71717a; font-weight: 500; min-width: 90px;">Time</span>
          <span style="color: #18181b; font-weight: 500;">{{startTime}} - {{endTime}}</span>
        </div>`)}

      {{#if refundProcessed}}
      <p style="margin: 20px 0 0; font-size: 14px; color: #52525b;">A refund of <strong>\${{refundAmount}}</strong> has been issued. Please allow 3-5 business days for it to appear.</p>
      {{/if}}

      <p style="margin: 20px 0 0; font-size: 14px; color: #52525b;">We hope to see you again soon.</p>
    `),
        text: `Booking Cancelled — {{brandName}}

{{#if isCancelledByEmployee}}Your booking has been cancelled by staff.{{#if cancellationReason}} Reason: {{cancellationReason}}{{/if}}{{else}}Your cancellation has been processed, {{userFullName}}.{{/if}}

Location: {{locationName}}
Space: {{spaceName}}
Date: {{startDate}}
Time: {{startTime}} - {{endTime}}

{{#if refundProcessed}}Refund: \${{refundAmount}} has been issued. Please allow 3-5 business days.{{/if}}

We hope to see you again soon.`,
        variables: ['userFullName', 'locationName', 'spaceName', 'startDate', 'startTime', 'endTime', 'formattedAmount', 'refundAmount', 'isCancelledByEmployee', 'cancellationReason', 'refundProcessed', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 4. TEAM INVITE
    // =========================================================================
    team_invite: {
        name: 'Team Invite',
        subject: `You've been invited to join "{{teamName}}" in {{leagueName}}`,
        html: plain('Team Invite', `
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #18181b;">Team Invite</h2>
      <p style="margin: 0 0 20px; font-size: 15px; color: #52525b;">{{captainName}} invited you to join their team.</p>

      ${detailCard(detailRow('Team', '{{teamName}}') +
            detailRow('League', '{{leagueName}}') +
            detailRow('Format', '{{playersPerTeam}} per team, {{numHoles}} holes') +
            detailRow('Season', '{{totalWeeks}} weeks') +
            `{{#if hasSeasonFee}}` + detailRow('Season Fee', '$' + '{{seasonFee}}') + `{{/if}}` +
            `{{#if hasPrizePot}}` + detailRow('Prize Pool', '$' + '{{totalPrizePot}}') + `{{/if}}` +
            `{{#if hasTotalCost}}<div style="display: flex; padding: 10px 0;">
          <span style="color: #71717a; font-weight: 500; min-width: 90px;">Total</span>
          <span style="color: #18181b; font-weight: 700;">$` + `{{totalCost}}</span>
        </div>{{/if}}`)}

      <p style="margin: 0 0 24px; font-size: 13px; color: #a1a1aa; text-align: center;">Each team member pays individually before the league starts.</p>

      <div style="text-align: center; margin: 24px 0;">
        ${btn('{{acceptUrl}}', 'Accept Invitation')}
        &nbsp;&nbsp;
        ${btn('{{declineUrl}}', 'Decline', 'secondary')}
      </div>
    `),
        text: `Team Invite — {{brandName}}

{{captainName}} invited you to join team "{{teamName}}" in {{leagueName}}.

Team: {{teamName}}
League: {{leagueName}}
Players per team: {{playersPerTeam}}
Season: {{totalWeeks}} weeks, {{numHoles}} holes
{{#if hasSeasonFee}}Season Fee: \${{seasonFee}}{{/if}}
{{#if hasPrizePot}}Prize Pool: \${{totalPrizePot}}{{/if}}
{{#if hasTotalCost}}Total: \${{totalCost}}{{/if}}

Accept: {{acceptUrl}}
Decline: {{declineUrl}}`,
        variables: ['captainName', 'teamName', 'leagueName', 'playersPerTeam', 'numHoles', 'totalWeeks', 'seasonFee', 'weeklyPrizePot', 'totalPrizePot', 'totalCost', 'acceptUrl', 'declineUrl', 'hasSeasonFee', 'hasPrizePot', 'hasTotalCost', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 5. TEAM STATUS
    // =========================================================================
    team_status: {
        name: 'Team Status Update',
        subject: 'Team Update: {{teamName}} — {{leagueName}}',
        html: plain('Team Update', `
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #18181b;">Team Update</h2>
      <p style="margin: 0 0 4px; font-size: 14px; color: #71717a;">{{teamName}} — {{leagueName}}</p>

      <div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0; font-size: 15px; color: #18181b; line-height: 1.6;">{{message}}</p>
      </div>

      {{#if actionUrl}}
      <div style="text-align: center; margin: 24px 0;">
        ${btn('{{actionUrl}}', '{{#if actionLabel}}{{actionLabel}}{{else}}View Details{{/if}}')}
      </div>
      {{/if}}
    `),
        text: `Team Update — {{brandName}}

{{teamName}} — {{leagueName}}

{{message}}

{{#if actionUrl}}{{#if actionLabel}}{{actionLabel}}{{else}}View Details{{/if}}: {{actionUrl}}{{/if}}`,
        variables: ['teamName', 'leagueName', 'message', 'actionUrl', 'actionLabel', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 6. ATTENDANCE REMINDER
    // =========================================================================
    attendance_reminder: {
        name: 'Attendance Reminder',
        subject: 'Confirm your attendance — {{leagueName}} Week {{weekNumber}}',
        html: plain('Attendance Confirmation', `
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #18181b;">Confirm Your Attendance</h2>
      <p style="margin: 0 0 20px; font-size: 15px; color: #52525b;">Hey {{playerName}}, are you playing this week?</p>

      ${detailCard(detailRow('League', '{{leagueName}}') +
            detailRow('Week', 'Week {{weekNumber}}') +
            detailRow('Date', '{{leagueDate}}') +
            `<div style="display: flex; padding: 10px 0;">
          <span style="color: #71717a; font-weight: 500; min-width: 90px;">Time</span>
          <span style="color: #18181b; font-weight: 500;">{{startTime}}</span>
        </div>`)}

      <div style="text-align: center; margin: 28px 0;">
        ${btn('{{confirmUrl}}', "I'm Playing")}
        &nbsp;&nbsp;
        ${btn('{{declineUrl}}', "Can't Make It", 'secondary')}
      </div>

      <p style="margin: 0; font-size: 13px; color: #a1a1aa; text-align: center;">If we don't hear from you, you'll be marked as not attending.</p>
    `),
        text: `Confirm Your Attendance — {{brandName}}

Hey {{playerName}}, are you playing this week?

League: {{leagueName}}
Week: {{weekNumber}}
Date: {{leagueDate}}
Time: {{startTime}}

Confirm: {{confirmUrl}}
Decline: {{declineUrl}}

If we don't hear from you, you'll be marked as not attending.`,
        variables: ['playerName', 'leagueName', 'weekNumber', 'leagueDate', 'startTime', 'confirmUrl', 'declineUrl', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 7. ENROLLMENT CONFIRMATION
    // =========================================================================
    enrollment_confirmation: {
        name: 'Enrollment Confirmation',
        subject: 'Enrollment confirmed — {{leagueName}}',
        html: plain('Enrollment Confirmed', `
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #18181b;">You're In</h2>
      <p style="margin: 0 0 20px; font-size: 15px; color: #52525b;">Hey {{playerName}}, you've enrolled in <strong>{{leagueName}}</strong>.</p>

      ${detailCard(detailRow('League', '{{leagueName}}') +
            detailRow('Format', '{{format}}') +
            detailRow('Schedule', '{{dayOfWeek}}s at {{startTime}}') +
            detailRow('Season', '{{totalWeeks}} weeks starting {{startDate}}') +
            `{{#if hasTotalPaid}}` + detailRow('Amount Paid', '$' + '{{totalPaid}}') + `{{/if}}` +
            `{{#if hasSeasonFee}}<div style="padding: 4px 0 4px 16px;"><span style="color: #a1a1aa; font-size: 13px;">Season Fee: $` + `{{seasonFee}}</span></div>{{/if}}` +
            `{{#if hasPrizePot}}<div style="padding: 4px 0 4px 16px;"><span style="color: #a1a1aa; font-size: 13px;">Prize Pool: $` + `{{prizePotTotal}}</span></div>{{/if}}`)}

      <div style="text-align: center; margin: 24px 0;">
        ${btn('{{dashboardUrl}}', 'View My Leagues')}
      </div>

      <p style="margin: 0; font-size: 13px; color: #a1a1aa; text-align: center;">Good luck this season.</p>
    `),
        text: `Enrollment Confirmed — {{brandName}}

Hey {{playerName}}, you've enrolled in {{leagueName}}.

Format: {{format}}
Schedule: {{dayOfWeek}}s at {{startTime}}
Season: {{totalWeeks}} weeks starting {{startDate}}
{{#if hasTotalPaid}}Amount Paid: \${{totalPaid}}{{/if}}

View your leagues: {{dashboardUrl}}`,
        variables: ['playerName', 'leagueName', 'format', 'dayOfWeek', 'startTime', 'totalWeeks', 'startDate', 'totalPaid', 'seasonFee', 'prizePotTotal', 'dashboardUrl', 'hasTotalPaid', 'hasSeasonFee', 'hasPrizePot', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 8. MEMBERSHIP WELCOME
    // =========================================================================
    membership_welcome: {
        name: 'Membership Welcome',
        subject: 'Welcome — {{planName}} Membership at {{locationName}}',
        html: plain('Membership Welcome', `
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #18181b;">Welcome, {{userFullName}}</h2>
      <p style="margin: 0 0 20px; font-size: 15px; color: #52525b;">You're now a <strong>{{planName}}</strong> member.</p>

      ${detailCard(detailRow('Plan', '{{planName}}') +
            detailRow('Location', '{{locationName}}') +
            detailRow('Billing', '$' + '{{formattedPrice}}/{{billingLabel}}') +
            `{{#if renewalDate}}<div style="display: flex; padding: 10px 0;">
          <span style="color: #71717a; font-weight: 500; min-width: 90px;">Next Renewal</span>
          <span style="color: #18181b; font-weight: 500;">{{renewalDate}}</span>
        </div>{{/if}}`)}

      {{#if hasBenefits}}
      <div style="margin: 20px 0;">
        <p style="margin: 0 0 10px; font-size: 14px; font-weight: 600; color: #18181b;">Your Benefits</p>
        <ul style="margin: 0; padding: 0 0 0 20px;">
          {{#each benefits}}
          <li style="padding: 4px 0; font-size: 14px; color: #52525b;">{{label}}</li>
          {{/each}}
        </ul>
      </div>
      {{/if}}

      <p style="margin: 20px 0 0; font-size: 14px; color: #52525b;">Head to your dashboard to start using your membership benefits.</p>
    `),
        text: `Welcome, {{userFullName}} — {{brandName}}

You're now a {{planName}} member at {{locationName}}.

Plan: {{planName}}
Billing: \${{formattedPrice}}/{{billingLabel}}
{{#if renewalDate}}Next Renewal: {{renewalDate}}{{/if}}

{{#if hasBenefits}}Your Benefits:
{{#each benefits}}
- {{label}}
{{/each}}
{{/if}}

Head to your dashboard to start using your membership benefits.`,
        variables: ['userFullName', 'planName', 'locationName', 'formattedPrice', 'billingLabel', 'renewalDate', 'benefits', 'hasBenefits', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 9. MEMBERSHIP CANCELED
    // =========================================================================
    membership_canceled: {
        name: 'Membership Canceled',
        subject: 'Membership canceled — {{planName}} at {{locationName}}',
        html: plain('Membership Canceled', `
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #18181b;">Membership Canceled</h2>
      <p style="margin: 0 0 20px; font-size: 15px; color: #52525b;">
        {{#if isImmediate}}Your {{planName}} membership has been canceled effective immediately.{{else}}Your {{planName}} membership will cancel at the end of your billing period.{{/if}}
      </p>

      ${detailCard(detailRow('Plan', '{{planName}}') +
            detailRow('Location', '{{locationName}}') +
            `<div style="display: flex; padding: 10px 0;">
          <span style="color: #71717a; font-weight: 500; min-width: 90px;">Type</span>
          <span style="color: #18181b; font-weight: 500;">{{#if isImmediate}}Immediate{{else}}End of period{{/if}}</span>
        </div>`)}

      {{#if hasRefund}}
      <p style="margin: 20px 0 0; font-size: 14px; color: #52525b;">A prorated refund of <strong>\${{formattedRefundAmount}}</strong> has been issued. Please allow 3-5 business days.</p>
      {{/if}}

      {{#if accessUntil}}
      <p style="margin: 16px 0 0; font-size: 14px; color: #52525b;">Your benefits remain active until <strong>{{accessUntil}}</strong>.</p>
      {{/if}}

      <p style="margin: 20px 0 0; font-size: 14px; color: #52525b;">You can re-subscribe anytime from the memberships page.</p>
    `),
        text: `Membership Canceled — {{brandName}}

{{#if isImmediate}}Your {{planName}} membership has been canceled effective immediately.{{else}}Your {{planName}} membership will cancel at the end of your billing period.{{/if}}

Plan: {{planName}}
Location: {{locationName}}

{{#if hasRefund}}Refund: \${{formattedRefundAmount}} has been issued. Please allow 3-5 business days.{{/if}}
{{#if accessUntil}}Your benefits remain active until {{accessUntil}}.{{/if}}

You can re-subscribe anytime from the memberships page.`,
        variables: ['userFullName', 'planName', 'locationName', 'isImmediate', 'formattedRefundAmount', 'accessUntil', 'hasRefund', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 10. POST-BOOKING REVIEW REQUEST
    // =========================================================================
    post_booking_review: {
        name: 'Post-Booking Review Request',
        subject: 'How was your session at {{locationName}}?',
        html: plain('Review Your Session', `
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #18181b;">Thanks for visiting</h2>
      <p style="margin: 0 0 24px; font-size: 15px; color: #52525b;">Hi {{userFullName}}, we hope you enjoyed your session.</p>

      <div style="text-align: center; margin: 28px 0;">
        ${btn('{{googleReviewUrl}}', 'Leave a Review')}
      </div>

      <p style="margin: 0; font-size: 14px; color: #52525b; text-align: center;">We'd love to hear your feedback.</p>
    `),
        text: `Thanks for visiting — {{brandName}}

Hi {{userFullName}}, we hope you enjoyed your session.

Leave a review: {{googleReviewUrl}}

We'd love to hear your feedback.`,
        variables: ['userFullName', 'locationName', 'googleReviewUrl', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 11. MARKETING CAMPAIGN
    // =========================================================================
    marketing_campaign: {
        name: 'Marketing Campaign (Default)',
        subject: '{{subject}}',
        html: plain('{{subject}}', `
      <h2 style="margin: 0 0 20px; font-size: 20px; color: #18181b;">{{subject}}</h2>
      {{body}}
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e4e4e7;">
        <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
          <a href="{{unsubscribeLink}}" style="color: #a1a1aa; text-decoration: underline;">Unsubscribe</a>
        </p>
      </div>
    `),
        text: `{{subject}}

{{textBody}}

To unsubscribe: {{unsubscribeLink}}`,
        variables: ['subject', 'body', 'textBody', 'locationName', 'unsubscribeLink'],
    },
    // =========================================================================
    // 12. BOOKING TIME CHANGED
    // =========================================================================
    booking_time_changed: {
        name: 'Booking Time Changed',
        subject: 'Booking rescheduled — {{locationName}}',
        html: plain('Booking Rescheduled', `
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #18181b;">Booking Rescheduled</h2>
      <p style="margin: 0 0 20px; font-size: 15px; color: #52525b;">Hi {{userFullName}}, your booking time has been updated.</p>

      ${detailCard(detailRow('Location', '{{locationName}}') +
            detailRow('Space', '{{spaceName}}') +
            detailRow('Date', '{{startDate}}') +
            `<div style="display: flex; padding: 10px 0;">
          <span style="color: #71717a; font-weight: 500; min-width: 90px;">Time</span>
          <span style="color: #18181b; font-weight: 500;">{{startTime}} - {{endTime}}</span>
        </div>`)}

      {{#if hasDoorLock}}
      <p style="margin: 20px 0 0; font-size: 14px; color: #52525b;">You'll receive a new reminder with your unlock link 15 minutes before the updated time.</p>
      {{/if}}
    `),
        text: `Booking Rescheduled — {{brandName}}

Hi {{userFullName}}, your booking time has been updated.

Location: {{locationName}}
Space: {{spaceName}}
Date: {{startDate}}
Time: {{startTime}} - {{endTime}}

{{#if hasDoorLock}}You'll receive a new reminder with your unlock link 15 minutes before the updated time.{{/if}}`,
        variables: ['userFullName', 'locationName', 'spaceName', 'startDate', 'startTime', 'endTime', 'hasDoorLock', 'brandName', 'brandColor', 'brandTagline'],
    },
};

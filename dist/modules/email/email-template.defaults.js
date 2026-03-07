"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TEMPLATES = void 0;
const sharedStyles = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  .email-body { background-color: #f5f7fa !important; }
  .email-container { background-color: #ffffff !important; }
  .text-primary { color: #2c5530 !important; }
  .text-secondary { color: #666 !important; }
  .text-tertiary { color: #333 !important; }
  .text-muted { color: #666 !important; }
  .border-light { border-color: #e0e0e0 !important; }
  .bg-card { background: linear-gradient(135deg, #f8fffe 0%, #e8f5e8 100%) !important; border: 2px solid #4a7c59 !important; }
  .brand-heading { color: #000000 !important; }
  @media (prefers-color-scheme: dark) {
    .email-body { background-color: #1a1a1a !important; }
    .email-container { background-color: #2d2d2d !important; }
    .text-primary { color: #6bb96e !important; }
    .text-secondary { color: #b0b0b0 !important; }
    .text-tertiary { color: #e0e0e0 !important; }
    .text-muted { color: #a0a0a0 !important; }
    .border-light { border-color: #4a4a4a !important; }
    .bg-card { background: linear-gradient(135deg, #3a4a3d 0%, #2d3a2f 100%) !important; border: 2px solid #6bb96e !important; }
    .brand-heading { color: #ffffff !important; }
  }
  [data-ogsc] .email-body { background-color: #1a1a1a !important; }
  [data-ogsc] .email-container { background-color: #2d2d2d !important; }
  [data-ogsc] .text-primary { color: #6bb96e !important; }
  [data-ogsc] .text-secondary { color: #b0b0b0 !important; }
  [data-ogsc] .text-tertiary { color: #e0e0e0 !important; }
  [data-ogsc] .text-muted { color: #a0a0a0 !important; }
  [data-ogsc] .border-light { border-color: #4a4a4a !important; }
  [data-ogsc] .bg-card { background: linear-gradient(135deg, #3a4a3d 0%, #2d3a2f 100%) !important; border: 2px solid #6bb96e !important; }
  [data-ogsc] .brand-heading { color: #ffffff !important; }
`;
function wrapInLayout(title, content, extraStyles = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${title}</title>
  <style>${sharedStyles}${extraStyles}</style>
</head>
<body class="email-body" style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <div class="email-container" style="max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #2c5530 0%, #4a7c59 100%); padding: 40px 30px; text-align: center;">
      <h1 class="brand-heading" style="margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 1px;">⛳ {{brandName}}</h1>
    </div>
    <div style="padding: 40px 30px;">
      ${content}
    </div>
    <div style="background-color: #2c5530; padding: 30px; text-align: center;">
      <p style="color: #ffffff; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">{{brandTagline}}</p>
      <p style="color: #a8d5aa; margin: 0; font-size: 14px;">{{brandName}} - Where Technology Meets Golf</p>
    </div>
  </div>
</body>
</html>`;
}
// ---------------------------------------------------------------------------
// Extra style blocks for specific templates
// ---------------------------------------------------------------------------
const confirmationExtraStyles = `
  .bg-notice { background-color: #fff3cd !important; border-color: #ffeaa7 !important; }
  .text-notice { color: #8a6d3b !important; }
  @media (prefers-color-scheme: dark) {
    .bg-notice { background-color: #4a3c1a !important; border-color: #6b5b2a !important; }
    .text-notice { color: #d4b85a !important; }
  }
  [data-ogsc] .bg-notice { background-color: #4a3c1a !important; border-color: #6b5b2a !important; }
  [data-ogsc] .text-notice { color: #d4b85a !important; }
`;
const reminderExtraStyles = `
  .bg-notice { background-color: #fff3cd !important; border-color: #ffeaa7 !important; }
  .text-notice { color: #8a6d3b !important; }
  .bg-info { background-color: #e8f4f8 !important; border-color: #17a2b8 !important; }
  .text-info { color: #0c5460 !important; }
  .unlock-button { background: linear-gradient(135deg, #4a7c59 0%, #2c5530 100%) !important; color: #000000 !important; box-shadow: 0 4px 15px rgba(76, 124, 89, 0.3) !important; }
  @media (prefers-color-scheme: dark) {
    .bg-notice { background-color: #4a3c1a !important; border-color: #6b5b2a !important; }
    .text-notice { color: #d4b85a !important; }
    .bg-info { background-color: #1a3c4a !important; border-color: #2a6b85 !important; }
    .text-info { color: #6bb9d4 !important; }
    .unlock-button { background: linear-gradient(135deg, #6bb96e 0%, #4a7c59 100%) !important; color: #ffffff !important; box-shadow: 0 4px 15px rgba(107, 185, 110, 0.4) !important; }
  }
  [data-ogsc] .bg-notice { background-color: #4a3c1a !important; border-color: #6b5b2a !important; }
  [data-ogsc] .text-notice { color: #d4b85a !important; }
  [data-ogsc] .bg-info { background-color: #1a3c4a !important; border-color: #2a6b85 !important; }
  [data-ogsc] .text-info { color: #6bb9d4 !important; }
  [data-ogsc] .unlock-button { background: linear-gradient(135deg, #6bb96e 0%, #4a7c59 100%) !important; color: #ffffff !important; box-shadow: 0 4px 15px rgba(107, 185, 110, 0.4) !important; }
`;
const cancellationExtraStyles = `
  .text-danger { color: #dc3545 !important; }
  .bg-card { background: linear-gradient(135deg, #fff8f8 0%, #ffe8e8 100%) !important; border: 2px solid #dc3545 !important; }
  .bg-refund { background-color: #d4edda !important; border-color: #c3e6cb !important; }
  .text-refund { color: #155724 !important; }
  .bg-notice { background-color: #d1ecf1 !important; border-color: #bee5eb !important; }
  .text-notice { color: #0c5460 !important; }
  @media (prefers-color-scheme: dark) {
    .text-danger { color: #f56565 !important; }
    .bg-card { background: linear-gradient(135deg, #4a3d3d 0%, #3d2f2f 100%) !important; border: 2px solid #f56565 !important; }
    .bg-refund { background-color: #1a4a2f !important; border-color: #2a6b45 !important; }
    .text-refund { color: #6bb96e !important; }
    .bg-notice { background-color: #1a4a5c !important; border-color: #2a6b85 !important; }
    .text-notice { color: #6bb9d4 !important; }
  }
  [data-ogsc] .text-danger { color: #f56565 !important; }
  [data-ogsc] .bg-card { background: linear-gradient(135deg, #4a3d3d 0%, #3d2f2f 100%) !important; border: 2px solid #f56565 !important; }
  [data-ogsc] .bg-refund { background-color: #1a4a2f !important; border-color: #2a6b45 !important; }
  [data-ogsc] .text-refund { color: #6bb96e !important; }
  [data-ogsc] .bg-notice { background-color: #1a4a5c !important; border-color: #2a6b85 !important; }
  [data-ogsc] .text-notice { color: #6bb9d4 !important; }
`;
const membershipCanceledExtraStyles = `
  .text-danger { color: #dc3545 !important; }
  .bg-card { background: linear-gradient(135deg, #fff8f8 0%, #ffe8e8 100%) !important; border: 2px solid #dc3545 !important; }
  .bg-refund { background-color: #d4edda !important; border-color: #c3e6cb !important; }
  .text-refund { color: #155724 !important; }
  .bg-notice { background-color: #fff3cd !important; border-color: #ffeaa7 !important; }
  .text-notice { color: #8a6d3b !important; }
  @media (prefers-color-scheme: dark) {
    .text-danger { color: #f56565 !important; }
    .bg-card { background: linear-gradient(135deg, #4a3d3d 0%, #3d2f2f 100%) !important; border: 2px solid #f56565 !important; }
    .bg-refund { background-color: #1a4a2f !important; border-color: #2a6b45 !important; }
    .text-refund { color: #6bb96e !important; }
    .bg-notice { background-color: #4a3c1a !important; border-color: #6b5b2a !important; }
    .text-notice { color: #d4b85a !important; }
  }
  [data-ogsc] .text-danger { color: #f56565 !important; }
  [data-ogsc] .bg-card { background: linear-gradient(135deg, #4a3d3d 0%, #3d2f2f 100%) !important; border: 2px solid #f56565 !important; }
  [data-ogsc] .bg-refund { background-color: #1a4a2f !important; border-color: #2a6b45 !important; }
  [data-ogsc] .text-refund { color: #6bb96e !important; }
  [data-ogsc] .bg-notice { background-color: #4a3c1a !important; border-color: #6b5b2a !important; }
  [data-ogsc] .text-notice { color: #d4b85a !important; }
`;
// ---------------------------------------------------------------------------
// Template map
// ---------------------------------------------------------------------------
exports.DEFAULT_TEMPLATES = {
    // =========================================================================
    // 1. BOOKING CONFIRMATION
    // =========================================================================
    booking_confirmation: {
        name: 'Booking Confirmation',
        subject: '🏌️ Thank you for your {{locationName}} booking!',
        html: wrapInLayout('Booking Confirmation', `
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 class="text-primary" style="margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">
          🎉 Booking Confirmed!
        </h2>
        <p class="text-secondary" style="margin: 0; font-size: 16px;">
          Thank you for choosing {{brandName}}, {{userFullName}}!
        </p>
      </div>

      <div class="bg-card" style="border-radius: 12px; padding: 30px; margin: 30px 0;">
        <h3 class="text-primary" style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; text-align: center;">
          📋 Your Booking Details
        </h3>
        <div style="display: grid; gap: 15px;">
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">📍 Location:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{locationName}}</span>
          </div>
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">🏌️ Bay:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{bayName}}</span>
          </div>
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">📅 Date:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{startDate}}</span>
          </div>
          <div style="display: flex; align-items: center; padding: 10px 0;">
            <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">⏰ Time:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{startTime}} - {{endTime}}</span>
          </div>
        </div>
      </div>

      <div class="bg-notice" style="border: 1px solid; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
        <h4 class="text-notice" style="margin: 0 0 10px 0; font-size: 16px;">
          📱 Reminder Coming Soon
        </h4>
        <p class="text-notice" style="margin: 0; font-size: 14px; line-height: 1.5;">
          You'll receive an email reminder 15 minutes before your session with your bay unlock link.
        </p>
      </div>

      <div style="text-align: center; margin-top: 40px;">
        <h3 class="text-primary" style="margin-bottom: 15px; font-size: 18px;">What's Next?</h3>
        <p class="text-secondary" style="margin: 0 0 20px 0; line-height: 1.6;">
          Just show up and we'll take care of the rest! You'll get your unlock link right before your session starts.
        </p>
      </div>
    `, confirmationExtraStyles),
        text: `🏌️ {{brandName}} - Booking Confirmed!

Thank you for your booking, {{userFullName}}!

📋 BOOKING DETAILS:
📍 Location: {{locationName}}
🏌️ Bay: {{bayName}}
📅 Date: {{startDate}}
⏰ Time: {{startTime}} - {{endTime}}

📱 WHAT'S NEXT:
You'll receive an email reminder 15 minutes before your session with your bay unlock link.

Just show up and we'll take care of the rest!

{{brandName}} - Where Technology Meets Golf`,
        variables: ['userFullName', 'locationName', 'bayName', 'startDate', 'startTime', 'endTime', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 2. BOOKING REMINDER
    // =========================================================================
    booking_reminder: {
        name: 'Booking Reminder',
        subject: '🚀 Your {{locationName}} session starts in 15 minutes!',
        html: wrapInLayout('Session Starting Soon', `
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 class="text-primary" style="margin: 0 0 10px 0; font-size: 26px; font-weight: 600;">
          🚀 Session Starting Soon!
        </h2>
        <p class="text-secondary" style="margin: 0; font-size: 18px; font-weight: 500;">
          Hi {{userFullName}}, your session starts in 15 minutes!
        </p>
      </div>

      <div class="bg-card" style="border-radius: 12px; padding: 30px; margin: 30px 0;">
        <h3 class="text-primary" style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; text-align: center;">
          🏌️ Your Session Details
        </h3>
        <div style="display: grid; gap: 15px;">
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">📍 Location:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{locationName}}</span>
          </div>
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">🏌️ Bay:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{bayName}}</span>
          </div>
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">📅 Date:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{startDate}}</span>
          </div>
          <div style="display: flex; align-items: center; padding: 10px 0;">
            <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">⏰ Time:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{startTime}} - {{endTime}}</span>
          </div>
        </div>
      </div>

      {{#if unlockLink}}
      <div style="text-align: center; margin: 40px 0;">
        <h3 class="text-primary" style="margin-bottom: 20px; font-size: 18px;">Ready to unlock your bay?</h3>
        <a href="{{unlockLink}}"
           class="unlock-button"
           style="padding: 18px 40px;
                  text-decoration: none;
                  border-radius: 50px;
                  font-weight: 600;
                  font-size: 16px;
                  display: inline-block;
                  transition: all 0.3s ease;
                  letter-spacing: 0.5px;">
          🔓 UNLOCK MY BAY
        </a>
      </div>

      <div class="bg-info" style="border-left: 4px solid; padding: 20px; margin: 30px 0; border-radius: 0 8px 8px 0;">
        <h4 class="text-info" style="margin: 0 0 10px 0; font-size: 16px;">
          📱 How to Use Your Unlock Link
        </h4>
        <p class="text-info" style="margin: 0; font-size: 14px; line-height: 1.5;">
          Click the "Unlock My Bay" button when you arrive at the facility. This link will automatically expire when your session ends for security.
        </p>
      </div>
      {{/if}}

      <div class="bg-notice" style="border: 1px solid; border-radius: 8px; padding: 20px; margin: 30px 0;">
        <h4 class="text-notice" style="margin: 0 0 10px 0; font-size: 16px;">
          🎯 Arrival Instructions
        </h4>
        <p class="text-notice" style="margin: 0; font-size: 14px; line-height: 1.5;">
          Please arrive 5 minutes early to get settled. If you need any assistance, our staff will be happy to help!
        </p>
      </div>

      <div style="text-align: center; margin-top: 40px;">
        <h3 class="text-primary" style="margin-bottom: 15px; font-size: 18px;">Time to Perfect Your Swing! 🎯</h3>
        <p class="text-secondary" style="margin: 0; line-height: 1.6;">
          Make every shot count and enjoy your session at {{brandName}}!
        </p>
      </div>
    `, reminderExtraStyles),
        text: `🚀 {{brandName}} - Session Starting Soon!

Hi {{userFullName}}, your session starts in 15 minutes!

🏌️ SESSION DETAILS:
📍 Location: {{locationName}}
🏌️ Bay: {{bayName}}
📅 Date: {{startDate}}
⏰ Time: {{startTime}} - {{endTime}}

{{#if unlockLink}}
🔓 UNLOCK YOUR BAY:
Click this link when you arrive: {{unlockLink}}

📱 INSTRUCTIONS:
This unlock link will work when you arrive at the facility and will expire when your session ends.
{{/if}}

🎯 ARRIVAL INSTRUCTIONS:
Please arrive 5 minutes early to get settled. If you need assistance, our staff will be happy to help!

Time to perfect your swing! 🎯

{{brandName}} - Where Technology Meets Golf`,
        variables: ['userFullName', 'locationName', 'bayName', 'startDate', 'startTime', 'endTime', 'unlockLink', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 3. BOOKING CANCELLATION
    // =========================================================================
    booking_cancellation: {
        name: 'Booking Cancellation',
        subject: '❌ Your {{locationName}} booking has been cancelled',
        html: wrapInLayout('Booking Cancelled', `
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 class="text-danger" style="margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">
          ❌ Booking Cancelled
        </h2>
        <p class="text-secondary" style="margin: 0; font-size: 16px;">
          {{#if isCancelledByEmployee}}
            We're sorry, but your booking has been cancelled by our staff.{{#if cancellationReason}} Reason: {{cancellationReason}}{{/if}}
          {{else}}
            Your booking cancellation has been processed successfully, {{userFullName}}.
          {{/if}}
        </p>
      </div>

      <div class="bg-card" style="border-radius: 12px; padding: 30px; margin: 30px 0;">
        <h3 class="text-danger" style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; text-align: center;">
          📋 Cancelled Booking Details
        </h3>
        <div style="display: grid; gap: 15px;">
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">📍 Location:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{locationName}}</span>
          </div>
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">🏌️ Bay:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{bayName}}</span>
          </div>
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">📅 Date:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{startDate}}</span>
          </div>
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">⏰ Time:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{startTime}} - {{endTime}}</span>
          </div>
          <div style="display: flex; align-items: center; padding: 10px 0;">
            <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">💰 Amount:</span>
            <span class="text-tertiary" style="font-weight: 500;">\${{formattedAmount}}</span>
          </div>
        </div>
      </div>

      {{#if refundProcessed}}
      <div class="bg-refund" style="border: 1px solid; border-radius: 8px; padding: 20px; margin: 30px 0;">
        <h4 class="text-refund" style="margin: 0 0 10px 0; font-size: 16px;">
          💳 Refund Information
        </h4>
        <p class="text-refund" style="margin: 0 0 10px 0; font-size: 14px; line-height: 1.5;">
          A full refund of <strong>\${{refundAmount}}</strong> has been processed to your original payment method.
        </p>
        <p class="text-refund" style="margin: 0; font-size: 14px; line-height: 1.5;">
          Please allow 3-5 business days for the refund to appear on your statement.
        </p>
      </div>
      {{/if}}

      {{#if isCancelledByEmployee}}
      <div class="bg-notice" style="border: 1px solid; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
        <h4 class="text-notice" style="margin: 0 0 10px 0; font-size: 16px;">
          🙏 We Apologize for the Inconvenience
        </h4>
        <p class="text-notice" style="margin: 0; font-size: 14px; line-height: 1.5;">
          We sincerely apologize for any inconvenience caused. If you have any questions or would like to reschedule, please don't hesitate to contact us.
        </p>
      </div>
      {{else}}
      <div class="bg-notice" style="border: 1px solid; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
        <h4 class="text-notice" style="margin: 0 0 10px 0; font-size: 16px;">
          🙏 Thank You for Understanding
        </h4>
        <p class="text-notice" style="margin: 0; font-size: 14px; line-height: 1.5;">
          We understand that plans can change. We hope to welcome you back to {{brandName}} soon!
        </p>
      </div>
      {{/if}}

      <div style="text-align: center; margin-top: 40px;">
        <h3 class="text-primary" style="margin-bottom: 15px; font-size: 18px;">Ready to Book Again? 🏌️‍♂️</h3>
        <p class="text-secondary" style="margin: 0 0 20px 0; line-height: 1.6;">
          We'd love to have you back! Visit our website to book your next session.
        </p>
      </div>
    `, cancellationExtraStyles),
        text: `❌ {{brandName}} - Booking Cancelled

{{#if isCancelledByEmployee}}We're sorry, but your booking has been cancelled by our staff.{{#if cancellationReason}} Reason: {{cancellationReason}}{{/if}}{{else}}Your booking cancellation has been processed successfully, {{userFullName}}.{{/if}}

📋 CANCELLED BOOKING DETAILS:
📍 Location: {{locationName}}
🏌️ Bay: {{bayName}}
📅 Date: {{startDate}}
⏰ Time: {{startTime}} - {{endTime}}
💰 Amount: \${{formattedAmount}}

{{#if refundProcessed}}
💳 REFUND INFORMATION:
A full refund of \${{refundAmount}} has been processed to your original payment method.
Please allow 3-5 business days for the refund to appear on your statement.
{{/if}}

{{#if isCancelledByEmployee}}🙏 We sincerely apologize for any inconvenience caused. If you have any questions or would like to reschedule, please don't hesitate to contact us.{{else}}🙏 We understand that plans can change. We hope to welcome you back to {{brandName}} soon!{{/if}}

Ready to book again? 🏌️‍♂️
We'd love to have you back! Visit our website to book your next session.

{{brandName}} - Where Technology Meets Golf`,
        variables: ['userFullName', 'locationName', 'bayName', 'startDate', 'startTime', 'endTime', 'formattedAmount', 'refundAmount', 'isCancelledByEmployee', 'cancellationReason', 'refundProcessed', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 4. TEAM INVITE
    // =========================================================================
    team_invite: {
        name: 'Team Invite',
        subject: `You've been invited to join "{{teamName}}" in {{leagueName}}!`,
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invite</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <div style="background: linear-gradient(135deg, #2c5530 0%, #4a7c59 100%); padding: 40px 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 1px; color: #ffffff;">
        {{brandName}}
      </h1>
    </div>

    <div style="padding: 40px 30px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="margin: 0 0 10px 0; font-size: 24px; font-weight: 600; color: #2c5530;">
          Team Invite
        </h2>
        <p style="margin: 0; font-size: 16px; color: #666;">
          {{captainName}} has invited you to join their team!
        </p>
      </div>

      <div style="background: linear-gradient(135deg, #f8fffe 0%, #e8f5e8 100%); border: 2px solid #4a7c59; border-radius: 12px; padding: 30px; margin: 30px 0;">
        <div style="display: grid; gap: 12px;">
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">Team:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">{{teamName}}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">League:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">{{leagueName}}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">Format:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">{{playersPerTeam}} players per team, {{numHoles}} holes</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">Season:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">{{totalWeeks}} weeks</span>
          </div>
          {{#if hasSeasonFee}}
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">Season Fee:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">\${{seasonFee}}</span>
          </div>
          {{/if}}
          {{#if hasPrizePot}}
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">Prize Pool Buy-In:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">\${{totalPrizePot}} (\${{weeklyPrizePot}}/week x {{totalWeeks}} weeks)</span>
          </div>
          {{/if}}
          {{#if hasTotalCost}}
          <div style="padding: 8px 0;">
            <span style="color: #4a7c59; font-weight: 600;">Total Cost:</span>
            <span style="color: #2c5530; font-weight: 700; font-size: 18px; margin-left: 8px;">\${{totalCost}}</span>
          </div>
          {{/if}}
        </div>
      </div>

      <p style="text-align: center; color: #666; font-size: 14px; margin: 20px 0;">
        Each team member pays individually. Payment is due before the league starts.
      </p>

      <div style="text-align: center; margin: 40px 0;">
        <a href="{{acceptUrl}}"
           style="display: inline-block; background: linear-gradient(135deg, #4a7c59 0%, #2c5530 100%); color: #ffffff; padding: 16px 40px; border-radius: 50px; font-weight: 600; font-size: 16px; text-decoration: none; margin-right: 12px;">
          Accept Invitation
        </a>
        <a href="{{declineUrl}}"
           style="display: inline-block; background: #f0f0f0; color: #666; padding: 16px 30px; border-radius: 50px; font-weight: 600; font-size: 14px; text-decoration: none;">
          Decline
        </a>
      </div>
    </div>

    <div style="background-color: #2c5530; padding: 30px; text-align: center;">
      <p style="color: #a8d5aa; margin: 0; font-size: 14px;">
        {{brandName}} - Where Technology Meets Golf
      </p>
    </div>
  </div>
</body>
</html>`,
        text: `{{brandName}} - Team Invite

{{captainName}} has invited you to join team "{{teamName}}" in {{leagueName}}!

DETAILS:
Team: {{teamName}}
League: {{leagueName}}
Players per team: {{playersPerTeam}}
Season: {{totalWeeks}} weeks, {{numHoles}} holes
{{#if hasSeasonFee}}Season Fee: \${{seasonFee}}{{/if}}
{{#if hasPrizePot}}Prize Pool Buy-In: \${{totalPrizePot}}{{/if}}
{{#if hasTotalCost}}Total Cost: \${{totalCost}}{{/if}}

Accept: {{acceptUrl}}
Decline: {{declineUrl}}`,
        variables: ['captainName', 'teamName', 'leagueName', 'playersPerTeam', 'numHoles', 'totalWeeks', 'seasonFee', 'weeklyPrizePot', 'totalPrizePot', 'totalCost', 'acceptUrl', 'declineUrl', 'hasSeasonFee', 'hasPrizePot', 'hasTotalCost', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 5. TEAM STATUS
    // =========================================================================
    team_status: {
        name: 'Team Status Update',
        subject: 'Team Update: {{teamName}} - {{leagueName}}',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Update</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <div style="background: linear-gradient(135deg, #2c5530 0%, #4a7c59 100%); padding: 40px 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 1px; color: #ffffff;">
        {{brandName}}
      </h1>
    </div>

    <div style="padding: 40px 30px;">
      <h2 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 600; color: #2c5530; text-align: center;">
        Team Update
      </h2>
      <p style="margin: 0 0 5px 0; font-size: 16px; color: #666; text-align: center;">
        {{teamName}} - {{leagueName}}
      </p>

      <div style="background: #f8f9fa; border-radius: 8px; padding: 24px; margin: 30px 0; text-align: center;">
        <p style="margin: 0; font-size: 16px; color: #333; line-height: 1.6;">
          {{message}}
        </p>
      </div>

      {{#if actionUrl}}
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{actionUrl}}"
           style="display: inline-block; background: linear-gradient(135deg, #4a7c59 0%, #2c5530 100%); color: #ffffff; padding: 14px 36px; border-radius: 50px; font-weight: 600; font-size: 15px; text-decoration: none;">
          {{#if actionLabel}}{{actionLabel}}{{else}}View Details{{/if}}
        </a>
      </div>
      {{/if}}
    </div>

    <div style="background-color: #2c5530; padding: 30px; text-align: center;">
      <p style="color: #a8d5aa; margin: 0; font-size: 14px;">
        {{brandName}} - Where Technology Meets Golf
      </p>
    </div>
  </div>
</body>
</html>`,
        text: `{{brandName}} - Team Update

{{teamName}} - {{leagueName}}

{{message}}

{{#if actionUrl}}{{#if actionLabel}}{{actionLabel}}{{else}}View Details{{/if}}: {{actionUrl}}{{/if}}`,
        variables: ['teamName', 'leagueName', 'message', 'actionUrl', 'actionLabel', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 6. ATTENDANCE REMINDER
    // =========================================================================
    attendance_reminder: {
        name: 'Attendance Reminder',
        subject: 'Confirm your attendance for {{leagueName}} - Week {{weekNumber}}',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Attendance Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <div style="background: linear-gradient(135deg, #2c5530 0%, #4a7c59 100%); padding: 40px 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 1px; color: #ffffff;">
        {{brandName}}
      </h1>
    </div>

    <div style="padding: 40px 30px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="margin: 0 0 10px 0; font-size: 24px; font-weight: 600; color: #2c5530;">
          Confirm Your Attendance
        </h2>
        <p style="margin: 0; font-size: 16px; color: #666;">
          This helps us reserve the right number of bays.
        </p>
      </div>

      <div style="background: linear-gradient(135deg, #f8fffe 0%, #e8f5e8 100%); border: 2px solid #4a7c59; border-radius: 12px; padding: 30px; margin: 30px 0;">
        <div style="display: grid; gap: 12px;">
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">League:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">{{leagueName}}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">Week:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">Week {{weekNumber}}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">Date:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">{{leagueDate}}</span>
          </div>
          <div style="padding: 8px 0;">
            <span style="color: #4a7c59; font-weight: 600;">Time:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">{{startTime}}</span>
          </div>
        </div>
      </div>

      <p style="text-align: center; color: #333; font-size: 16px; margin: 24px 0; font-weight: 500;">
        Hey {{playerName}}, are you playing this week?
      </p>

      <div style="text-align: center; margin: 40px 0;">
        <a href="{{confirmUrl}}"
           style="display: inline-block; background: linear-gradient(135deg, #4a7c59 0%, #2c5530 100%); color: #ffffff; padding: 16px 40px; border-radius: 50px; font-weight: 600; font-size: 16px; text-decoration: none; margin: 0 8px;">
          I'm Playing
        </a>
        <a href="{{declineUrl}}"
           style="display: inline-block; background: #ffffff; color: #666; padding: 14px 40px; border-radius: 50px; font-weight: 600; font-size: 16px; text-decoration: none; border: 2px solid #e0e0e0; margin: 0 8px;">
          Can't Make It
        </a>
      </div>

      <p style="text-align: center; color: #999; font-size: 13px; margin-top: 20px;">
        If we don't hear from you, you'll be marked as not attending for capacity planning.
      </p>
    </div>

    <div style="background-color: #2c5530; padding: 30px; text-align: center;">
      <p style="color: #a8d5aa; margin: 0; font-size: 14px;">
        {{brandName}} - Where Technology Meets Golf
      </p>
    </div>
  </div>
</body>
</html>`,
        text: `{{brandName}} - Attendance Confirmation

Hey {{playerName}}, are you playing this week?

League: {{leagueName}}
Week: {{weekNumber}}
Date: {{leagueDate}}
Time: {{startTime}}

Confirm: {{confirmUrl}}
Decline: {{declineUrl}}

This helps us reserve the right number of bays.`,
        variables: ['playerName', 'leagueName', 'weekNumber', 'leagueDate', 'startTime', 'confirmUrl', 'declineUrl', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 7. ENROLLMENT CONFIRMATION
    // =========================================================================
    enrollment_confirmation: {
        name: 'Enrollment Confirmation',
        subject: `You're in! League enrollment confirmed — {{leagueName}}`,
        html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; padding: 32px 16px;">
    <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: linear-gradient(135deg, #00A36C, #008f5d); padding: 32px 24px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">You're In!</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">League enrollment confirmed</p>
      </div>
      <div style="padding: 24px;">
        <p style="color: #333; font-size: 15px; margin: 0 0 20px;">Hey {{playerName}},</p>
        <p style="color: #333; font-size: 15px; margin: 0 0 20px;">You've successfully enrolled in <strong>{{leagueName}}</strong>. Here are your league details:</p>
        <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">League:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">{{leagueName}}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">Format:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">{{format}}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">Schedule:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">{{dayOfWeek}}s at {{startTime}}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">Season:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">{{totalWeeks}} weeks starting {{startDate}}</span>
          </div>
          {{#if hasTotalPaid}}
          <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
            <span style="color: #4a7c59; font-weight: 600;">Amount Paid:</span>
            <span style="color: #333; font-weight: 500; margin-left: 8px;">\${{totalPaid}}</span>
          </div>
          {{#if hasSeasonFee}}
          <div style="padding: 4px 0 4px 16px;">
            <span style="color: #888; font-size: 13px;">Season Fee: \${{seasonFee}}</span>
          </div>
          {{/if}}
          {{#if hasPrizePot}}
          <div style="padding: 4px 0 4px 16px;">
            <span style="color: #888; font-size: 13px;">Prize Pool: \${{prizePotTotal}}</span>
          </div>
          {{/if}}
          {{/if}}
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="{{dashboardUrl}}" style="display: inline-block; background: #00A36C; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">View My Leagues</a>
        </div>
        <p style="color: #888; font-size: 13px; margin: 20px 0 0; text-align: center;">Good luck this season!</p>
      </div>
    </div>
  </div>
</body>
</html>`,
        text: `You're In! League enrollment confirmed.

Hey {{playerName}},

You've enrolled in {{leagueName}}.
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
        subject: 'Welcome to {{locationName}} — {{planName}} Membership!',
        html: wrapInLayout('Membership Welcome', `
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 class="text-primary" style="margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">
          Welcome, {{userFullName}}!
        </h2>
        <p class="text-secondary" style="margin: 0; font-size: 16px;">
          You're now a <strong>{{planName}}</strong> member
        </p>
      </div>

      <div class="bg-card" style="border-radius: 12px; padding: 30px; margin: 30px 0;">
        <h3 class="text-primary" style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; text-align: center;">
          Membership Details
        </h3>
        <div style="display: grid; gap: 12px;">
          <div style="padding: 8px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">Plan:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{planName}}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">Location:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{locationName}}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">Billing:</span>
            <span class="text-tertiary" style="font-weight: 500;">\${{formattedPrice}}/{{billingLabel}}</span>
          </div>
          {{#if renewalDate}}
          <div style="padding: 8px 0;">
            <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">Next Renewal:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{renewalDate}}</span>
          </div>
          {{/if}}
        </div>
      </div>

      {{#if hasBenefits}}
      <div style="margin: 30px 0;">
        <h3 class="text-primary" style="margin: 0 0 15px 0; font-size: 18px; font-weight: 600; text-align: center;">Your Benefits</h3>
        <ul style="list-style: none; padding: 0; margin: 0;">
          {{#each benefits}}
          <li style="padding: 6px 0; display: flex; align-items: center;">
            <span style="color: #4a7c59; margin-right: 8px; font-size: 16px;">&#10003;</span>
            <span class="text-tertiary">{{label}}</span>
          </li>
          {{/each}}
        </ul>
      </div>
      {{/if}}

      <div style="text-align: center; margin-top: 40px;">
        <h3 class="text-primary" style="margin-bottom: 15px; font-size: 18px;">Ready to book your first session?</h3>
        <p class="text-secondary" style="margin: 0 0 20px 0; line-height: 1.6;">
          Head to your dashboard to start using your membership benefits.
        </p>
      </div>
    `),
        text: `{{brandName}} - Welcome, {{userFullName}}!

You're now a {{planName}} member at {{locationName}}.

MEMBERSHIP DETAILS:
Plan: {{planName}}
Billing: \${{formattedPrice}}/{{billingLabel}}
{{#if renewalDate}}Next Renewal: {{renewalDate}}{{/if}}

{{#if hasBenefits}}
YOUR BENEFITS:
{{#each benefits}}
- {{label}}
{{/each}}
{{/if}}

Ready to book your first session? Head to your dashboard!

{{brandName}} - Where Technology Meets Golf`,
        variables: ['userFullName', 'planName', 'locationName', 'formattedPrice', 'billingLabel', 'renewalDate', 'benefits', 'hasBenefits', 'brandName', 'brandColor', 'brandTagline'],
    },
    // =========================================================================
    // 9. MEMBERSHIP CANCELED
    // =========================================================================
    membership_canceled: {
        name: 'Membership Canceled',
        subject: 'Your {{locationName}} {{planName}} membership has been canceled',
        html: wrapInLayout('Membership Canceled', `
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 class="text-danger" style="margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">
          Membership Canceled
        </h2>
        <p class="text-secondary" style="margin: 0; font-size: 16px;">
          {{#if isImmediate}}
            Your {{planName}} membership has been canceled effective immediately.
          {{else}}
            Your {{planName}} membership has been set to cancel at the end of your billing period.
          {{/if}}
        </p>
      </div>

      <div class="bg-card" style="border-radius: 12px; padding: 30px; margin: 30px 0;">
        <h3 class="text-danger" style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; text-align: center;">
          Cancellation Details
        </h3>
        <div style="display: grid; gap: 12px;">
          <div style="padding: 8px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">Plan:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{planName}}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid;" class="border-light">
            <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">Location:</span>
            <span class="text-tertiary" style="font-weight: 500;">{{locationName}}</span>
          </div>
          <div style="padding: 8px 0;">
            <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">Type:</span>
            <span class="text-tertiary" style="font-weight: 500;">
              {{#if isImmediate}}Immediate cancellation{{else}}Cancel at end of period{{/if}}
            </span>
          </div>
        </div>
      </div>

      {{#if hasRefund}}
      <div class="bg-refund" style="border: 1px solid; border-radius: 8px; padding: 20px; margin: 30px 0;">
        <h4 class="text-refund" style="margin: 0 0 10px 0; font-size: 16px;">Refund Information</h4>
        <p class="text-refund" style="margin: 0 0 10px 0; font-size: 14px; line-height: 1.5;">
          A prorated refund of <strong>\${{formattedRefundAmount}}</strong> has been issued to your original payment method.
        </p>
        <p class="text-refund" style="margin: 0; font-size: 14px; line-height: 1.5;">
          Please allow 3-5 business days for the refund to appear on your statement.
        </p>
      </div>
      {{/if}}

      {{#if accessUntil}}
      <div class="bg-notice" style="border: 1px solid; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
        <h4 class="text-notice" style="margin: 0 0 10px 0; font-size: 16px;">You Still Have Access</h4>
        <p class="text-notice" style="margin: 0; font-size: 14px; line-height: 1.5;">
          Your membership benefits remain active until <strong>{{accessUntil}}</strong>. You can continue to use your free hours and book sessions until then.
        </p>
      </div>
      {{/if}}

      <div style="text-align: center; margin-top: 40px;">
        <h3 class="text-primary" style="margin-bottom: 15px; font-size: 18px;">We'll miss you!</h3>
        <p class="text-secondary" style="margin: 0 0 20px 0; line-height: 1.6;">
          You can re-subscribe anytime from the memberships page. We'd love to have you back.
        </p>
      </div>
    `, membershipCanceledExtraStyles),
        text: `{{brandName}} - Membership Canceled

{{#if isImmediate}}Your {{planName}} membership has been canceled effective immediately.{{else}}Your {{planName}} membership has been set to cancel at the end of your billing period.{{/if}}

CANCELLATION DETAILS:
Plan: {{planName}}
Location: {{locationName}}
Type: {{#if isImmediate}}Immediate cancellation{{else}}Cancel at end of period{{/if}}

{{#if hasRefund}}
REFUND: A prorated refund of \${{formattedRefundAmount}} has been issued. Please allow 3-5 business days.
{{/if}}
{{#if accessUntil}}Your membership benefits remain active until {{accessUntil}}.{{/if}}

You can re-subscribe anytime from the memberships page.

{{brandName}} - Where Technology Meets Golf`,
        variables: ['userFullName', 'planName', 'locationName', 'isImmediate', 'formattedRefundAmount', 'accessUntil', 'hasRefund', 'brandName', 'brandColor', 'brandTagline'],
    },
    marketing_campaign: {
        name: 'Marketing Campaign (Default)',
        subject: '{{subject}}',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>{{subject}}</title>
  <style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  .email-body { background-color: #f5f7fa !important; }
  .email-container { background-color: #ffffff !important; }
  .text-primary { color: #2c5530 !important; }
  .text-secondary { color: #666 !important; }
  .text-tertiary { color: #333 !important; }
  .brand-heading { color: #000000 !important; }
  @media (prefers-color-scheme: dark) {
    .email-body { background-color: #1a1a1a !important; }
    .email-container { background-color: #2d2d2d !important; }
    .text-primary { color: #6bb96e !important; }
    .text-secondary { color: #b0b0b0 !important; }
    .text-tertiary { color: #e0e0e0 !important; }
    .brand-heading { color: #ffffff !important; }
  }
  [data-ogsc] .email-body { background-color: #1a1a1a !important; }
  [data-ogsc] .email-container { background-color: #2d2d2d !important; }
  [data-ogsc] .text-primary { color: #6bb96e !important; }
  [data-ogsc] .text-secondary { color: #b0b0b0 !important; }
  [data-ogsc] .text-tertiary { color: #e0e0e0 !important; }
  [data-ogsc] .brand-heading { color: #ffffff !important; }
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <div class="email-container" style="max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #2c5530 0%, #4a7c59 100%); padding: 40px 30px; text-align: center;">
      <h1 class="brand-heading" style="margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 1px;">{{locationName}}</h1>
    </div>
    <div style="padding: 40px 30px;">
      <h2 class="text-primary" style="margin: 0 0 24px 0; font-size: 22px; font-weight: 600;">{{subject}}</h2>
      {{{body}}}
    </div>
    <div style="background-color: #2c5530; padding: 30px; text-align: center;">
      <p style="color: #a8d5aa; margin: 0 0 15px 0; font-size: 14px;">{{locationName}} - Where Technology Meets Golf</p>
      <p style="margin: 0;">
        <a href="{{unsubscribeLink}}" style="color: #78b87c; font-size: 12px; text-decoration: underline;">Unsubscribe from marketing emails</a>
      </p>
    </div>
  </div>
</body>
</html>`,
        text: `{{subject}}

{{textBody}}

{{locationName}} - Where Technology Meets Golf

To unsubscribe: {{unsubscribeLink}}`,
        variables: ['subject', 'body', 'textBody', 'locationName', 'unsubscribeLink'],
    },
};

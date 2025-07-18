"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailTemplates = void 0;
const date_fns_tz_1 = require("date-fns-tz");
class EmailTemplates {
    static thankYou(data) {
        const formattedAmount = (data.totalAmount / 100).toFixed(2);
        // Convert UTC times to location timezone
        const timezone = data.locationTimezone || 'America/New_York';
        const localStartTime = (0, date_fns_tz_1.toZonedTime)(new Date(data.startTime), timezone);
        const localEndTime = (0, date_fns_tz_1.toZonedTime)(new Date(data.endTime), timezone);
        const startDate = (0, date_fns_tz_1.format)(localStartTime, 'EEEE, MMMM d, yyyy', { timeZone: timezone });
        const startTime = (0, date_fns_tz_1.format)(localStartTime, 'h:mm a', { timeZone: timezone });
        const endTime = (0, date_fns_tz_1.format)(localEndTime, 'h:mm a', { timeZone: timezone });
        return {
            subject: '🏌️ Thank you for your Golf Labs US booking!',
            html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta name="color-scheme" content="light dark">
          <meta name="supported-color-schemes" content="light dark">
          <title>Booking Confirmation - Golf Labs US</title>
          <style>
            /* Light and Dark Mode Support */
            :root {
              color-scheme: light dark;
              supported-color-schemes: light dark;
            }
            
            /* Light Mode (Default) */
            .email-body {
              background-color: #f5f7fa !important;
            }
            .email-container {
              background-color: #ffffff !important;
            }
            .text-primary {
              color: #2c5530 !important;
            }
            .text-secondary {
              color: #666 !important;
            }
            .text-tertiary {
              color: #333 !important;
            }
            .text-muted {
              color: #666 !important;
            }
            .border-light {
              border-color: #e0e0e0 !important;
            }
            .bg-card {
              background: linear-gradient(135deg, #f8fffe 0%, #e8f5e8 100%) !important;
              border: 2px solid #4a7c59 !important;
            }
            .bg-notice {
              background-color: #fff3cd !important;
              border-color: #ffeaa7 !important;
            }
            .text-notice {
              color: #8a6d3b !important;
            }
            
            /* Dark Mode Overrides */
            @media (prefers-color-scheme: dark) {
              .email-body {
                background-color: #1a1a1a !important;
              }
              .email-container {
                background-color: #2d2d2d !important;
              }
              .text-primary {
                color: #6bb96e !important;
              }
              .text-secondary {
                color: #b0b0b0 !important;
              }
              .text-tertiary {
                color: #e0e0e0 !important;
              }
              .text-muted {
                color: #a0a0a0 !important;
              }
              .border-light {
                border-color: #4a4a4a !important;
              }
              .bg-card {
                background: linear-gradient(135deg, #3a4a3d 0%, #2d3a2f 100%) !important;
                border: 2px solid #6bb96e !important;
              }
              .bg-notice {
                background-color: #4a3c1a !important;
                border-color: #6b5b2a !important;
              }
              .text-notice {
                color: #d4b85a !important;
              }
            }
            
            /* Force dark mode for specific email clients */
            [data-ogsc] .email-body {
              background-color: #1a1a1a !important;
            }
            [data-ogsc] .email-container {
              background-color: #2d2d2d !important;
            }
            [data-ogsc] .text-primary {
              color: #6bb96e !important;
            }
            [data-ogsc] .text-secondary {
              color: #b0b0b0 !important;
            }
            [data-ogsc] .text-tertiary {
              color: #e0e0e0 !important;
            }
            [data-ogsc] .text-muted {
              color: #a0a0a0 !important;
            }
            [data-ogsc] .border-light {
              border-color: #4a4a4a !important;
            }
            [data-ogsc] .bg-card {
              background: linear-gradient(135deg, #3a4a3d 0%, #2d3a2f 100%) !important;
              border: 2px solid #6bb96e !important;
            }
            [data-ogsc] .bg-notice {
              background-color: #4a3c1a !important;
              border-color: #6b5b2a !important;
            }
            [data-ogsc] .text-notice {
              color: #d4b85a !important;
            }
          </style>
        </head>
        <body class="email-body" style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <div class="email-container" style="max-width: 600px; margin: 0 auto;">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #2c5530 0%, #4a7c59 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 1px;">
                ⛳ GOLF LABS US
              </h1>
            </div>
            
            <!-- Main Content -->
            <div style="padding: 40px 30px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h2 class="text-primary" style="margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">
                  🎉 Booking Confirmed!
                </h2>
                <p class="text-secondary" style="margin: 0; font-size: 16px;">
                  Thank you for choosing Golf Labs US, ${data.userFullName}!
                </p>
              </div>
              
              <!-- Booking Details Card -->
              <div class="bg-card" style="border-radius: 12px; padding: 30px; margin: 30px 0;">
                <h3 class="text-primary" style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; text-align: center;">
                  📋 Your Booking Details
                </h3>
                
                <div style="display: grid; gap: 15px;">
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">📍 Location:</span>
                    <span class="text-tertiary" style="font-weight: 500;">${data.locationName}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">🏌️ Bay:</span>
                    <span class="text-tertiary" style="font-weight: 500;">${data.bayName}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">📅 Date:</span>
                    <span class="text-tertiary" style="font-weight: 500;">${startDate}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">⏰ Time:</span>
                    <span class="text-tertiary" style="font-weight: 500;">${startTime} - ${endTime}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">💰 Total:</span>
                    <span class="text-primary" style="font-weight: 700; font-size: 18px;">$${formattedAmount}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">🎫 Booking ID:</span>
                    <span class="text-muted" style="font-family: monospace; font-size: 14px;">${data.bookingId}</span>
                  </div>
                </div>
              </div>
              
              <!-- Reminder Notice -->
              <div class="bg-notice" style="border: 1px solid; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
                <h4 class="text-notice" style="margin: 0 0 10px 0; font-size: 16px;">
                  📱 Reminder Coming Soon
                </h4>
                <p class="text-notice" style="margin: 0; font-size: 14px; line-height: 1.5;">
                  You'll receive an email reminder 15 minutes before your session with your bay unlock link.
                </p>
              </div>
              
              <!-- What's Next -->
              <div style="text-align: center; margin-top: 40px;">
                <h3 class="text-primary" style="margin-bottom: 15px; font-size: 18px;">What's Next?</h3>
                <p class="text-secondary" style="margin: 0 0 20px 0; line-height: 1.6;">
                  Just show up and we'll take care of the rest! You'll get your unlock link right before your session starts.
                </p>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #2c5530; padding: 30px; text-align: center;">
              <p style="color: #ffffff; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">
                Ready to improve your game? 🏌️‍♂️
              </p>
              <p style="color: #a8d5aa; margin: 0; font-size: 14px;">
                Golf Labs US - Where Technology Meets Golf
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
            text: `
        🏌️ GOLF LABS US - Booking Confirmed!
        
        Thank you for your booking, ${data.userFullName}!
        
        📋 BOOKING DETAILS:
        📍 Location: ${data.locationName}
        🏌️ Bay: ${data.bayName}
        📅 Date: ${startDate}
        ⏰ Time: ${startTime} - ${endTime}
        💰 Total: $${formattedAmount}
        🎫 Booking ID: ${data.bookingId}
        
        📱 WHAT'S NEXT:
        You'll receive an email reminder 15 minutes before your session with your bay unlock link.
        
        Just show up and we'll take care of the rest!
        
        Golf Labs US - Where Technology Meets Golf
      `
        };
    }
    static reminder(data) {
        // Convert UTC times to location timezone
        const timezone = data.locationTimezone || 'America/New_York';
        const localStartTime = (0, date_fns_tz_1.toZonedTime)(new Date(data.startTime), timezone);
        const localEndTime = (0, date_fns_tz_1.toZonedTime)(new Date(data.endTime), timezone);
        const startDate = (0, date_fns_tz_1.format)(localStartTime, 'EEEE, MMMM d, yyyy', { timeZone: timezone });
        const startTime = (0, date_fns_tz_1.format)(localStartTime, 'h:mm a', { timeZone: timezone });
        const endTime = (0, date_fns_tz_1.format)(localEndTime, 'h:mm a', { timeZone: timezone });
        return {
            subject: '🚀 Your Golf Labs US session starts in 15 minutes!',
            html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta name="color-scheme" content="light dark">
          <meta name="supported-color-schemes" content="light dark">
          <title>Session Starting Soon - Golf Labs US</title>
          <style>
            /* Light and Dark Mode Support */
            :root {
              color-scheme: light dark;
              supported-color-schemes: light dark;
            }
            
            /* Light Mode (Default) */
            .email-body {
              background-color: #f5f7fa !important;
            }
            .email-container {
              background-color: #ffffff !important;
            }
            .text-primary {
              color: #2c5530 !important;
            }
            .text-secondary {
              color: #666 !important;
            }
            .text-tertiary {
              color: #333 !important;
            }
            .text-muted {
              color: #666 !important;
            }
            .border-light {
              border-color: #e0e0e0 !important;
            }
            .bg-card {
              background: linear-gradient(135deg, #f8fffe 0%, #e8f5e8 100%) !important;
              border: 2px solid #4a7c59 !important;
            }
            .bg-notice {
              background-color: #fff3cd !important;
              border-color: #ffeaa7 !important;
            }
            .text-notice {
              color: #8a6d3b !important;
            }
            .bg-info {
              background-color: #e8f4f8 !important;
              border-color: #17a2b8 !important;
            }
            .text-info {
              color: #0c5460 !important;
            }
            .unlock-button {
              background: linear-gradient(135deg, #4a7c59 0%, #2c5530 100%) !important;
              color: #ffffff !important;
              box-shadow: 0 4px 15px rgba(76, 124, 89, 0.3) !important;
            }
            
            /* Dark Mode Overrides */
            @media (prefers-color-scheme: dark) {
              .email-body {
                background-color: #1a1a1a !important;
              }
              .email-container {
                background-color: #2d2d2d !important;
              }
              .text-primary {
                color: #6bb96e !important;
              }
              .text-secondary {
                color: #b0b0b0 !important;
              }
              .text-tertiary {
                color: #e0e0e0 !important;
              }
              .text-muted {
                color: #a0a0a0 !important;
              }
              .border-light {
                border-color: #4a4a4a !important;
              }
              .bg-card {
                background: linear-gradient(135deg, #3a4a3d 0%, #2d3a2f 100%) !important;
                border: 2px solid #6bb96e !important;
              }
              .bg-notice {
                background-color: #4a3c1a !important;
                border-color: #6b5b2a !important;
              }
              .text-notice {
                color: #d4b85a !important;
              }
              .bg-info {
                background-color: #1a3c4a !important;
                border-color: #2a6b85 !important;
              }
              .text-info {
                color: #6bb9d4 !important;
              }
              .unlock-button {
                background: linear-gradient(135deg, #6bb96e 0%, #4a7c59 100%) !important;
                color: #ffffff !important;
                box-shadow: 0 4px 15px rgba(107, 185, 110, 0.4) !important;
              }
            }
            
            /* Force dark mode for specific email clients */
            [data-ogsc] .email-body {
              background-color: #1a1a1a !important;
            }
            [data-ogsc] .email-container {
              background-color: #2d2d2d !important;
            }
            [data-ogsc] .text-primary {
              color: #6bb96e !important;
            }
            [data-ogsc] .text-secondary {
              color: #b0b0b0 !important;
            }
            [data-ogsc] .text-tertiary {
              color: #e0e0e0 !important;
            }
            [data-ogsc] .text-muted {
              color: #a0a0a0 !important;
            }
            [data-ogsc] .border-light {
              border-color: #4a4a4a !important;
            }
            [data-ogsc] .bg-card {
              background: linear-gradient(135deg, #3a4a3d 0%, #2d3a2f 100%) !important;
              border: 2px solid #6bb96e !important;
            }
            [data-ogsc] .bg-notice {
              background-color: #4a3c1a !important;
              border-color: #6b5b2a !important;
            }
            [data-ogsc] .text-notice {
              color: #d4b85a !important;
            }
            [data-ogsc] .bg-info {
              background-color: #1a3c4a !important;
              border-color: #2a6b85 !important;
            }
            [data-ogsc] .text-info {
              color: #6bb9d4 !important;
            }
            [data-ogsc] .unlock-button {
              background: linear-gradient(135deg, #6bb96e 0%, #4a7c59 100%) !important;
              color: #ffffff !important;
              box-shadow: 0 4px 15px rgba(107, 185, 110, 0.4) !important;
            }
          </style>
        </head>
        <body class="email-body" style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <div class="email-container" style="max-width: 600px; margin: 0 auto;">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #2c5530 0%, #4a7c59 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 1px;">
                ⛳ GOLF LABS US
              </h1>
            </div>
            
            <!-- Main Content -->
            <div style="padding: 40px 30px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h2 class="text-primary" style="margin: 0 0 10px 0; font-size: 26px; font-weight: 600;">
                  🚀 Session Starting Soon!
                </h2>
                <p class="text-secondary" style="margin: 0; font-size: 18px; font-weight: 500;">
                  Hi ${data.userFullName}, your session starts in 15 minutes!
                </p>
              </div>
              
              <!-- Session Details Card -->
              <div class="bg-card" style="border-radius: 12px; padding: 30px; margin: 30px 0;">
                <h3 class="text-primary" style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; text-align: center;">
                  🏌️ Your Session Details
                </h3>
                
                <div style="display: grid; gap: 15px;">
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">📍 Location:</span>
                    <span class="text-tertiary" style="font-weight: 500;">${data.locationName}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">🏌️ Bay:</span>
                    <span class="text-tertiary" style="font-weight: 500;">${data.bayName}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">📅 Date:</span>
                    <span class="text-tertiary" style="font-weight: 500;">${startDate}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">⏰ Time:</span>
                    <span class="text-tertiary" style="font-weight: 500;">${startTime} - ${endTime}</span>
                  </div>
                </div>
              </div>
              
              ${data.unlockLink ? `
              <!-- Unlock Button -->
              <div style="text-align: center; margin: 40px 0;">
                <h3 class="text-primary" style="margin-bottom: 20px; font-size: 18px;">Ready to unlock your bay?</h3>
                <a href="${data.unlockLink}" 
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
              ` : ''}
              
              <!-- Arrival Instructions -->
              <div class="bg-notice" style="border: 1px solid; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h4 class="text-notice" style="margin: 0 0 10px 0; font-size: 16px;">
                  🎯 Arrival Instructions
                </h4>
                <p class="text-notice" style="margin: 0; font-size: 14px; line-height: 1.5;">
                  Please arrive 5 minutes early to get settled. If you need any assistance, our staff will be happy to help!
                </p>
              </div>
              
              <!-- Motivational Message -->
              <div style="text-align: center; margin-top: 40px;">
                <h3 class="text-primary" style="margin-bottom: 15px; font-size: 18px;">Time to Perfect Your Swing! 🎯</h3>
                <p class="text-secondary" style="margin: 0; line-height: 1.6;">
                  Make every shot count and enjoy your session at Golf Labs US!
                </p>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #2c5530; padding: 30px; text-align: center;">
              <p style="color: #ffffff; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">
                Have a great session! 🏌️‍♂️⛳
              </p>
              <p style="color: #a8d5aa; margin: 0; font-size: 14px;">
                Golf Labs US - Where Technology Meets Golf
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
            text: `
        🚀 GOLF LABS US - Session Starting Soon!
        
        Hi ${data.userFullName}, your session starts in 15 minutes!
        
        🏌️ SESSION DETAILS:
        📍 Location: ${data.locationName}
        🏌️ Bay: ${data.bayName}
        📅 Date: ${startDate}
        ⏰ Time: ${startTime} - ${endTime}
        
        ${data.unlockLink ? `
        🔓 UNLOCK YOUR BAY:
        Click this link when you arrive: ${data.unlockLink}
        
        📱 INSTRUCTIONS:
        This unlock link will work when you arrive at the facility and will expire when your session ends.
        ` : ''}
        
        🎯 ARRIVAL INSTRUCTIONS:
        Please arrive 5 minutes early to get settled. If you need assistance, our staff will be happy to help!
        
        Time to perfect your swing! 🎯
        
        Golf Labs US - Where Technology Meets Golf
      `
        };
    }
    static cancellation(data) {
        const formattedAmount = (data.totalAmount / 100).toFixed(2);
        const refundAmount = data.refundAmount ? data.refundAmount.toFixed(2) : formattedAmount;
        // Convert UTC times to location timezone
        const timezone = data.locationTimezone || 'America/New_York';
        const localStartTime = (0, date_fns_tz_1.toZonedTime)(new Date(data.startTime), timezone);
        const localEndTime = (0, date_fns_tz_1.toZonedTime)(new Date(data.endTime), timezone);
        const startDate = (0, date_fns_tz_1.format)(localStartTime, 'EEEE, MMMM d, yyyy', { timeZone: timezone });
        const startTime = (0, date_fns_tz_1.format)(localStartTime, 'h:mm a', { timeZone: timezone });
        const endTime = (0, date_fns_tz_1.format)(localEndTime, 'h:mm a', { timeZone: timezone });
        const isCancelledByEmployee = data.cancelledBy === 'employee';
        const reasonText = data.cancellationReason ? ` Reason: ${data.cancellationReason}` : '';
        return {
            subject: '❌ Your Golf Labs US booking has been cancelled',
            html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta name="color-scheme" content="light dark">
          <meta name="supported-color-schemes" content="light dark">
          <title>Booking Cancelled - Golf Labs US</title>
          <style>
            /* Light and Dark Mode Support */
            :root {
              color-scheme: light dark;
              supported-color-schemes: light dark;
            }
            
            /* Light Mode (Default) */
            .email-body {
              background-color: #f5f7fa !important;
            }
            .email-container {
              background-color: #ffffff !important;
            }
            .text-primary {
              color: #2c5530 !important;
            }
            .text-secondary {
              color: #666 !important;
            }
            .text-tertiary {
              color: #333 !important;
            }
            .text-muted {
              color: #666 !important;
            }
            .text-danger {
              color: #dc3545 !important;
            }
            .border-light {
              border-color: #e0e0e0 !important;
            }
            .bg-card {
              background: linear-gradient(135deg, #fff8f8 0%, #ffe8e8 100%) !important;
              border: 2px solid #dc3545 !important;
            }
            .bg-notice {
              background-color: #d1ecf1 !important;
              border-color: #bee5eb !important;
            }
            .text-notice {
              color: #0c5460 !important;
            }
            .bg-refund {
              background-color: #d4edda !important;
              border-color: #c3e6cb !important;
            }
            .text-refund {
              color: #155724 !important;
            }
            
            /* Dark Mode Overrides */
            @media (prefers-color-scheme: dark) {
              .email-body {
                background-color: #1a1a1a !important;
              }
              .email-container {
                background-color: #2d2d2d !important;
              }
              .text-primary {
                color: #6bb96e !important;
              }
              .text-secondary {
                color: #b0b0b0 !important;
              }
              .text-tertiary {
                color: #e0e0e0 !important;
              }
              .text-muted {
                color: #a0a0a0 !important;
              }
              .text-danger {
                color: #f56565 !important;
              }
              .border-light {
                border-color: #4a4a4a !important;
              }
              .bg-card {
                background: linear-gradient(135deg, #4a3d3d 0%, #3d2f2f 100%) !important;
                border: 2px solid #f56565 !important;
              }
              .bg-notice {
                background-color: #1a4a5c !important;
                border-color: #2a6b85 !important;
              }
              .text-notice {
                color: #6bb9d4 !important;
              }
              .bg-refund {
                background-color: #1a4a2f !important;
                border-color: #2a6b45 !important;
              }
              .text-refund {
                color: #6bb96e !important;
              }
            }
          </style>
        </head>
        <body class="email-body" style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <div class="email-container" style="max-width: 600px; margin: 0 auto;">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #2c5530 0%, #4a7c59 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 1px;">
                ⛳ GOLF LABS US
              </h1>
            </div>
            
            <!-- Main Content -->
            <div style="padding: 40px 30px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h2 class="text-danger" style="margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">
                  ❌ Booking Cancelled
                </h2>
                <p class="text-secondary" style="margin: 0; font-size: 16px;">
                  ${isCancelledByEmployee ?
                `We're sorry, but your booking has been cancelled by our staff.${reasonText}` :
                `Your booking cancellation has been processed successfully, ${data.userFullName}.`}
                </p>
              </div>
              
              <!-- Cancelled Booking Details Card -->
              <div class="bg-card" style="border-radius: 12px; padding: 30px; margin: 30px 0;">
                <h3 class="text-danger" style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; text-align: center;">
                  📋 Cancelled Booking Details
                </h3>
                
                <div style="display: grid; gap: 15px;">
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">📍 Location:</span>
                    <span class="text-tertiary" style="font-weight: 500;">${data.locationName}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">🏌️ Bay:</span>
                    <span class="text-tertiary" style="font-weight: 500;">${data.bayName}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">📅 Date:</span>
                    <span class="text-tertiary" style="font-weight: 500;">${startDate}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">⏰ Time:</span>
                    <span class="text-tertiary" style="font-weight: 500;">${startTime} - ${endTime}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid;" class="border-light">
                    <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">💰 Amount:</span>
                    <span class="text-tertiary" style="font-weight: 500;">$${formattedAmount}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #dc3545; font-weight: 600; width: 120px; display: inline-block;">🎫 Booking ID:</span>
                    <span class="text-muted" style="font-family: monospace; font-size: 14px;">${data.bookingId}</span>
                  </div>
                </div>
              </div>
              
              ${data.refundProcessed ? `
              <!-- Refund Information -->
              <div class="bg-refund" style="border: 1px solid; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h4 class="text-refund" style="margin: 0 0 10px 0; font-size: 16px;">
                  💳 Refund Information
                </h4>
                <p class="text-refund" style="margin: 0 0 10px 0; font-size: 14px; line-height: 1.5;">
                  A full refund of <strong>$${refundAmount}</strong> has been processed to your original payment method.
                </p>
                <p class="text-refund" style="margin: 0; font-size: 14px; line-height: 1.5;">
                  Please allow 3-5 business days for the refund to appear on your statement.
                </p>
              </div>
              ` : ''}
              
              ${isCancelledByEmployee ? `
              <!-- Apology Message -->
              <div class="bg-notice" style="border: 1px solid; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
                <h4 class="text-notice" style="margin: 0 0 10px 0; font-size: 16px;">
                  🙏 We Apologize for the Inconvenience
                </h4>
                <p class="text-notice" style="margin: 0; font-size: 14px; line-height: 1.5;">
                  We sincerely apologize for any inconvenience caused. If you have any questions or would like to reschedule, please don't hesitate to contact us.
                </p>
              </div>
              ` : `
              <!-- Thank You Message -->
              <div class="bg-notice" style="border: 1px solid; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
                <h4 class="text-notice" style="margin: 0 0 10px 0; font-size: 16px;">
                  🙏 Thank You for Understanding
                </h4>
                <p class="text-notice" style="margin: 0; font-size: 14px; line-height: 1.5;">
                  We understand that plans can change. We hope to welcome you back to Golf Labs US soon!
                </p>
              </div>
              `}
              
              <!-- Next Steps -->
              <div style="text-align: center; margin-top: 40px;">
                <h3 class="text-primary" style="margin-bottom: 15px; font-size: 18px;">Ready to Book Again? 🏌️‍♂️</h3>
                <p class="text-secondary" style="margin: 0 0 20px 0; line-height: 1.6;">
                  We'd love to have you back! Visit our website to book your next session.
                </p>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #2c5530; padding: 30px; text-align: center;">
              <p style="color: #ffffff; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">
                We hope to see you again soon! 🏌️‍♂️
              </p>
              <p style="color: #a8d5aa; margin: 0; font-size: 14px;">
                Golf Labs US - Where Technology Meets Golf
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
            text: `
        ❌ GOLF LABS US - Booking Cancelled
        
        ${isCancelledByEmployee ?
                `We're sorry, but your booking has been cancelled by our staff.${reasonText}` :
                `Your booking cancellation has been processed successfully, ${data.userFullName}.`}
        
        📋 CANCELLED BOOKING DETAILS:
        📍 Location: ${data.locationName}
        🏌️ Bay: ${data.bayName}
        📅 Date: ${startDate}
        ⏰ Time: ${startTime} - ${endTime}
        💰 Amount: $${formattedAmount}
        🎫 Booking ID: ${data.bookingId}
        
        ${data.refundProcessed ? `
        💳 REFUND INFORMATION:
        A full refund of $${refundAmount} has been processed to your original payment method.
        Please allow 3-5 business days for the refund to appear on your statement.
        ` : ''}
        
        ${isCancelledByEmployee ? `
        🙏 We sincerely apologize for any inconvenience caused. If you have any questions or would like to reschedule, please don't hesitate to contact us.
        ` : `
        🙏 We understand that plans can change. We hope to welcome you back to Golf Labs US soon!
        `}
        
        Ready to book again? 🏌️‍♂️
        We'd love to have you back! Visit our website to book your next session.
        
        Golf Labs US - Where Technology Meets Golf
      `
        };
    }
}
exports.EmailTemplates = EmailTemplates;

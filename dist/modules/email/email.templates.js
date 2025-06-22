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
          <title>Booking Confirmation - Golf Labs US</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #2c5530 0%, #4a7c59 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 1px;">
                ⛳ GOLF LABS US
              </h1>
            </div>
            
            <!-- Main Content -->
            <div style="padding: 40px 30px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h2 style="color: #2c5530; margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">
                  🎉 Booking Confirmed!
                </h2>
                <p style="color: #666; margin: 0; font-size: 16px;">
                  Thank you for choosing Golf Labs US, ${data.userFullName}!
                </p>
              </div>
              
              <!-- Booking Details Card -->
              <div style="background: linear-gradient(135deg, #f8fffe 0%, #e8f5e8 100%); border: 2px solid #4a7c59; border-radius: 12px; padding: 30px; margin: 30px 0;">
                <h3 style="color: #2c5530; margin: 0 0 20px 0; font-size: 20px; font-weight: 600; text-align: center;">
                  📋 Your Booking Details
                </h3>
                
                <div style="display: grid; gap: 15px;">
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">📍 Location:</span>
                    <span style="color: #333; font-weight: 500;">${data.locationName}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">🏌️ Bay:</span>
                    <span style="color: #333; font-weight: 500;">${data.bayName}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">📅 Date:</span>
                    <span style="color: #333; font-weight: 500;">${startDate}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">⏰ Time:</span>
                    <span style="color: #333; font-weight: 500;">${startTime} - ${endTime}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">💰 Total:</span>
                    <span style="color: #2c5530; font-weight: 700; font-size: 18px;">$${formattedAmount}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">🎫 Booking ID:</span>
                    <span style="color: #666; font-family: monospace; font-size: 14px;">${data.bookingId}</span>
                  </div>
                </div>
              </div>
              
              <!-- Reminder Notice -->
              <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
                <h4 style="color: #8a6d3b; margin: 0 0 10px 0; font-size: 16px;">
                  📱 Reminder Coming Soon
                </h4>
                <p style="color: #8a6d3b; margin: 0; font-size: 14px; line-height: 1.5;">
                  You'll receive an email reminder 15 minutes before your session with your bay unlock link.
                </p>
              </div>
              
              <!-- What's Next -->
              <div style="text-align: center; margin-top: 40px;">
                <h3 style="color: #2c5530; margin-bottom: 15px; font-size: 18px;">What's Next?</h3>
                <p style="color: #666; margin: 0 0 20px 0; line-height: 1.6;">
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
          <title>Session Starting Soon - Golf Labs US</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #2c5530 0%, #4a7c59 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 1px;">
                ⛳ GOLF LABS US
              </h1>
            </div>
            
            <!-- Main Content -->
            <div style="padding: 40px 30px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h2 style="color: #2c5530; margin: 0 0 10px 0; font-size: 26px; font-weight: 600;">
                  🚀 Session Starting Soon!
                </h2>
                <p style="color: #666; margin: 0; font-size: 18px; font-weight: 500;">
                  Hi ${data.userFullName}, your session starts in 15 minutes!
                </p>
              </div>
              
              <!-- Session Details Card -->
              <div style="background: linear-gradient(135deg, #f8fffe 0%, #e8f5e8 100%); border: 2px solid #4a7c59; border-radius: 12px; padding: 30px; margin: 30px 0;">
                <h3 style="color: #2c5530; margin: 0 0 20px 0; font-size: 20px; font-weight: 600; text-align: center;">
                  🏌️ Your Session Details
                </h3>
                
                <div style="display: grid; gap: 15px;">
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">📍 Location:</span>
                    <span style="color: #333; font-weight: 500;">${data.locationName}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">🏌️ Bay:</span>
                    <span style="color: #333; font-weight: 500;">${data.bayName}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">📅 Date:</span>
                    <span style="color: #333; font-weight: 500;">${startDate}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #4a7c59; font-weight: 600; width: 120px; display: inline-block;">⏰ Time:</span>
                    <span style="color: #333; font-weight: 500;">${startTime} - ${endTime}</span>
                  </div>
                </div>
              </div>
              
              ${data.unlockLink ? `
              <!-- Unlock Button -->
              <div style="text-align: center; margin: 40px 0;">
                <h3 style="color: #2c5530; margin-bottom: 20px; font-size: 18px;">Ready to unlock your bay?</h3>
                <a href="${data.unlockLink}" 
                   style="background: linear-gradient(135deg, #4a7c59 0%, #2c5530 100%); 
                          color: #ffffff; 
                          padding: 18px 40px; 
                          text-decoration: none; 
                          border-radius: 50px; 
                          font-weight: 600; 
                          font-size: 16px;
                          display: inline-block;
                          box-shadow: 0 4px 15px rgba(76, 124, 89, 0.3);
                          transition: all 0.3s ease;
                          letter-spacing: 0.5px;">
                  🔓 UNLOCK MY BAY
                </a>
              </div>
              
              <div style="background-color: #e8f4f8; border-left: 4px solid #17a2b8; padding: 20px; margin: 30px 0; border-radius: 0 8px 8px 0;">
                <h4 style="color: #0c5460; margin: 0 0 10px 0; font-size: 16px;">
                  📱 How to Use Your Unlock Link
                </h4>
                <p style="color: #0c5460; margin: 0; font-size: 14px; line-height: 1.5;">
                  Click the "Unlock My Bay" button when you arrive at the facility. This link will automatically expire when your session ends for security.
                </p>
              </div>
              ` : ''}
              
              <!-- Arrival Instructions -->
              <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h4 style="color: #8a6d3b; margin: 0 0 10px 0; font-size: 16px;">
                  🎯 Arrival Instructions
                </h4>
                <p style="color: #8a6d3b; margin: 0; font-size: 14px; line-height: 1.5;">
                  Please arrive 5 minutes early to get settled. If you need any assistance, our staff will be happy to help!
                </p>
              </div>
              
              <!-- Motivational Message -->
              <div style="text-align: center; margin-top: 40px;">
                <h3 style="color: #2c5530; margin-bottom: 15px; font-size: 18px;">Time to Perfect Your Swing! 🎯</h3>
                <p style="color: #666; margin: 0; line-height: 1.6;">
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
}
exports.EmailTemplates = EmailTemplates;

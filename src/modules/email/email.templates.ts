import { EmailTemplate, BookingEmailData } from './email.types';

export class EmailTemplates {
  static thankYou(data: BookingEmailData): EmailTemplate {
    const formattedAmount = (data.totalAmount / 100).toFixed(2);
    const startDate = new Date(data.startTime).toLocaleDateString();
    const startTime = new Date(data.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTime = new Date(data.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return {
      subject: 'Thank you for your SimBay booking!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h1 style="color: #333; margin-bottom: 20px;">Thank You for Your Booking!</h1>
            
            <p>Hi ${data.userFullName},</p>
            
            <p>Your SimBay booking has been confirmed! Here are your details:</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
              <h3 style="color: #2c5aa0; margin-top: 0;">Booking Details</h3>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Location:</strong> ${data.locationName}</li>
                <li><strong>Bay:</strong> ${data.bayName}</li>
                <li><strong>Date:</strong> ${startDate}</li>
                <li><strong>Time:</strong> ${startTime} - ${endTime}</li>
                <li><strong>Total:</strong> $${formattedAmount}</li>
                <li><strong>Booking ID:</strong> ${data.bookingId}</li>
              </ul>
            </div>
            
            <p>You'll receive a reminder email 15 minutes before your session with your unlock link.</p>
            
            <p>We're excited to see you soon!</p>
            
            <p>Best regards,<br/>
            The SimBay Team</p>
          </div>
        </div>
      `,
      text: `
        Thank You for Your Booking!
        
        Hi ${data.userFullName},
        
        Your SimBay booking has been confirmed! Here are your details:
        
        Location: ${data.locationName}
        Bay: ${data.bayName}
        Date: ${startDate}
        Time: ${startTime} - ${endTime}
        Total: $${formattedAmount}
        Booking ID: ${data.bookingId}
        
        You'll receive a reminder email 15 minutes before your session with your unlock link.
        
        We're excited to see you soon!
        
        Best regards,
        The SimBay Team
      `
    };
  }

  static reminder(data: BookingEmailData): EmailTemplate {
    const startDate = new Date(data.startTime).toLocaleDateString();
    const startTime = new Date(data.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTime = new Date(data.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return {
      subject: 'Your SimBay session starts in 15 minutes!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h1 style="color: #333; margin-bottom: 20px;">Your Session Starts Soon!</h1>
            
            <p>Hi ${data.userFullName},</p>
            
            <p>Your SimBay session starts in 15 minutes. Here are your details:</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
              <h3 style="color: #2c5aa0; margin-top: 0;">Session Details</h3>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Location:</strong> ${data.locationName}</li>
                <li><strong>Bay:</strong> ${data.bayName}</li>
                <li><strong>Date:</strong> ${startDate}</li>
                <li><strong>Time:</strong> ${startTime} - ${endTime}</li>
              </ul>
            </div>
            
            ${data.unlockLink ? `
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.unlockLink}" 
                 style="background-color: #2c5aa0; color: white; padding: 15px 30px; 
                        text-decoration: none; border-radius: 6px; font-weight: bold;
                        display: inline-block;">
                🔓 Unlock My Bay
              </a>
            </div>
            
            <p style="font-size: 14px; color: #666;">
              Click the button above when you arrive at the facility to unlock your bay.
              This link will expire when your session ends.
            </p>
            ` : ''}
            
            <p>Safe travels and enjoy your session!</p>
            
            <p>Best regards,<br/>
            The SimBay Team</p>
          </div>
        </div>
      `,
      text: `
        Your Session Starts Soon!
        
        Hi ${data.userFullName},
        
        Your SimBay session starts in 15 minutes. Here are your details:
        
        Location: ${data.locationName}
        Bay: ${data.bayName}
        Date: ${startDate}
        Time: ${startTime} - ${endTime}
        
        ${data.unlockLink ? `
        When you arrive, use this link to unlock your bay:
        ${data.unlockLink}
        
        This link will expire when your session ends.
        ` : ''}
        
        Safe travels and enjoy your session!
        
        Best regards,
        The SimBay Team
      `
    };
  }
} 
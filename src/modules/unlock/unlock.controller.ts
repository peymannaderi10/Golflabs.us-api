import { Request, Response } from 'express';
import { SocketService } from '../sockets/socket.service';
import { supabase } from '../../config/database';

interface UnlockTokenData {
  bookingId: string;
  startTime: string;
  endTime: string;
  expires: number;
}

export class UnlockController {
  private socketService: SocketService;

  constructor(socketService: SocketService) {
    this.socketService = socketService;
  }

  unlockDoor = async (req: Request, res: Response) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Token is required' });
      }

      // Decode and verify the token
      let tokenData: UnlockTokenData;
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        tokenData = JSON.parse(decoded);
      } catch (error) {
        console.error('Error decoding unlock token:', error);
        return res.status(400).json({ error: 'Invalid token format' });
      }

      const { bookingId, expires } = tokenData;

      // Check if token is expired
      if (Date.now() > expires) {
        console.log(`Unlock token expired for booking ${bookingId}`);
        return res.status(403).json({ error: 'Token has expired' });
      }

      // Verify booking exists and is confirmed
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('id, status, bay_id, location_id, user_id, start_time, end_time')
        .eq('id', bookingId)
        .single();

      if (bookingError || !booking) {
        console.error(`Booking ${bookingId} not found:`, bookingError);
        return res.status(404).json({ error: 'Booking not found' });
      }

      if (booking.status !== 'confirmed') {
        console.log(`Booking ${bookingId} has invalid status for unlock: ${booking.status}`);
        return res.status(403).json({ error: 'Booking is not confirmed' });
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
          bay_id: booking.bay_id,
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
        console.error('Error logging unlock attempt:', logError);
        // Don't fail the request, just log the error
      }

      // Send unlock command to kiosk via websocket
      const unlockSuccessful = await this.socketService.sendUnlockCommand(
        booking.location_id,
        booking.bay_id,
        5, // 5 seconds unlock duration
        bookingId
      );

      if (!unlockSuccessful) {
        console.error(`Unlock failed for booking ${bookingId}: Kiosk did not confirm.`);
        
        // Log the failure
        await supabase.from('access_logs').insert({
          location_id: booking.location_id,
          bay_id: booking.bay_id,
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

      console.log(`Door unlock command acknowledged as successful for booking ${bookingId}`);
      
      res.json({
        success: true,
        message: 'Access granted! The door is now unlocked.',
        bookingId,
        unlockDuration: 5
      });

    } catch (error: any) {
      console.error('Error in unlock door:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  };
} 
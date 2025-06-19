-- DATABASE FUNCTION: create_booking_and_payment_record

-- This function creates a new booking and a corresponding payment record in a single transaction.

-- PARAMS:
-- - p_location_id: UUID of the location
-- - p_user_id: UUID of the user making the booking
-- - p_bay_id: UUID of the bay being booked
-- - p_start_time: Start timestamp of the booking
-- - p_end_time: End timestamp of the booking
-- - p_party_size: Number of people in the party
-- - p_total_amount: Total cost of the booking
-- - p_payment_intent_id: The Stripe Payment Intent ID
-- - p_user_agent: User agent of the client for logging
-- - p_ip_address: IP address of the client for logging

-- RETURNS:
-- - JSON object with the new booking_id and payment_id

CREATE OR REPLACE FUNCTION create_booking_and_payment_record(
    p_location_id UUID,
    p_user_id UUID,
    p_bay_id UUID,
    p_start_time TIMESTAMP,
    p_end_time TIMESTAMP,
    p_party_size INTEGER,
    p_total_amount DECIMAL,
    p_payment_intent_id VARCHAR,
    p_user_agent TEXT,
    p_ip_address INET
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_booking_id UUID;
    new_payment_id UUID;
    user_email VARCHAR;
    booking_details_json JSONB;
BEGIN
    -- Insert into bookings table with 'pending' status (will be updated to 'reserved' by API)
    INSERT INTO bookings (
        location_id, user_id, bay_id, start_time, end_time, 
        party_size, total_amount, status, payment_intent_id, notes
    ) VALUES (
        p_location_id, p_user_id, p_bay_id, p_start_time, p_end_time,
        p_party_size, p_total_amount, 'pending', p_payment_intent_id, 'Booking created via API'
    ) RETURNING id INTO new_booking_id;

    -- Insert into payments table
    INSERT INTO payments (
        location_id, booking_id, user_id, stripe_payment_intent_id, 
        amount, status, payment_method
    ) VALUES (
        p_location_id, new_booking_id, p_user_id, p_payment_intent_id,
        p_total_amount, 'pending', 'card'
    ) RETURNING id INTO new_payment_id;

    -- Log the initial access record
    INSERT INTO access_logs (
        location_id, booking_id, bay_id, user_id, 
        action, success, "timestamp", ip_address, user_agent
    ) VALUES (
        p_location_id, new_booking_id, p_bay_id, p_user_id, 
        'booking_created', true, NOW(), p_ip_address, p_user_agent
    );
    
    -- Create JSONB object of the new booking for the audit log
    booking_details_json := jsonb_build_object(
        'id', new_booking_id,
        'location_id', p_location_id,
        'user_id', p_user_id,
        'bay_id', p_bay_id,
        'start_time', p_start_time,
        'end_time', p_end_time,
        'total_amount', p_total_amount,
        'status', 'pending'
    );

    -- Log the audit trail for booking creation
    INSERT INTO audit_logs (
        location_id, table_name, record_id, action, new_values, user_id, ip_address, user_agent
    ) VALUES (
        p_location_id, 'bookings', new_booking_id::TEXT, 'INSERT', 
        booking_details_json, p_user_id, p_ip_address, p_user_agent
    );
    
    -- Fetch user email for notification
    SELECT email INTO user_email FROM user_profiles WHERE id = p_user_id;

    -- Insert notification record
    IF user_email IS NOT NULL THEN
        INSERT INTO notifications (
            location_id, user_id, booking_id, type, channel, recipient, 
            subject, content, status
        ) VALUES (
            p_location_id, p_user_id, new_booking_id, 'booking_reserved', 'email',
            user_email, 'Your Booking Reservation is Confirmed', 
            'Your booking has been reserved. Please complete the payment within 2 minutes to confirm.', 'pending'
        );
    END IF;

    -- Return the IDs of the created records
    RETURN jsonb_build_object('booking_id', new_booking_id, 'payment_id', new_payment_id);
END;
$$; 
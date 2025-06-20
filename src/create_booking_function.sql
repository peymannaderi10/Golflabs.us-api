-- DATABASE FUNCTION: create_booking_and_payment_record

-- This function creates a new booking with proper logging and audit trails.
-- Payment records are handled separately by the API when Stripe payment intent is created.

-- PARAMS:
-- - p_location_id: UUID of the location
-- - p_user_id: UUID of the user making the booking
-- - p_bay_id: UUID of the bay being booked
-- - p_start_time: Start timestamp of the booking
-- - p_end_time: End timestamp of the booking
-- - p_party_size: Number of people in the party
-- - p_total_amount: Total cost of the booking
-- - p_payment_intent_id: Temporary payment intent ID for tracking
-- - p_user_agent: User agent of the client for logging
-- - p_ip_address: IP address of the client for logging

-- RETURNS:
-- - JSON object with the new booking_id

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
    booking_details_json JSONB;
    conflict_count INTEGER;
BEGIN
    -- Check for conflicting bookings (exclude cancelled, expired, and no_show bookings)
    SELECT COUNT(*) INTO conflict_count
    FROM bookings
    WHERE bay_id = p_bay_id
      AND location_id = p_location_id
      AND start_time < p_end_time
      AND end_time > p_start_time
      AND status NOT IN ('cancelled', 'expired', 'no_show');

    -- If there are conflicts, raise an exception
    IF conflict_count > 0 THEN
        RAISE EXCEPTION 'Time slot is already booked. Please choose a different time.';
    END IF;

    -- Insert into bookings table with 'reserved' status and set expiration
    INSERT INTO bookings (
        location_id, user_id, bay_id, start_time, end_time, 
        party_size, total_amount, status, payment_intent_id, notes,
        expires_at
    ) VALUES (
        p_location_id, p_user_id, p_bay_id, p_start_time, p_end_time,
        p_party_size, p_total_amount, 'reserved', p_payment_intent_id, 'Booking created via API',
        NOW() + INTERVAL '2 minutes'
    ) RETURNING id INTO new_booking_id;

    -- Log the initial access record
    INSERT INTO access_logs (
        location_id, booking_id, bay_id, user_id, 
        action, success, "timestamp", ip_address, user_agent
    ) VALUES (
        p_location_id, new_booking_id, p_bay_id, p_user_id, 
        'booking_reserved', true, NOW(), p_ip_address, p_user_agent
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
        'status', 'reserved',
        'expires_at', NOW() + INTERVAL '2 minutes'
    );

    -- Log the audit trail for booking creation
    INSERT INTO audit_logs (
        location_id, table_name, record_id, action, new_values, user_id, ip_address, user_agent
    ) VALUES (
        p_location_id, 'bookings', new_booking_id::TEXT, 'INSERT', 
        booking_details_json, p_user_id, p_ip_address, p_user_agent
    );
    
    -- NOTE: No payment record or notification created here
    -- Payment record will be created when Stripe payment intent is generated
    -- Notification will be sent when user reaches checkout page

    -- Return the booking ID
    RETURN jsonb_build_object('booking_id', new_booking_id);
END;
$$; 
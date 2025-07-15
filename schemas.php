<?php
		$booking_insert_data = array(
            'booking_id'         => $booking_id,
			'fan_id'             => $fan_id,
			'creator_id'         => $creator_id,
			'booking_date'       => $booking_date,
			'booking_start_time' => $booking_start,
			'booking_end_time'   => $booking_end,
			'status'             => $negotiation_phase ? 'negotiation' : 'pending', //enums
			'negotiation_phase'  => $negotiation_phase ? 1 : 0,
			'surcharge_fee'      => $price_breakdown['surcharge_price'],
			'default_fee'        => $price_breakdown['regular_price'],
            //add missed by
            //call_status
            //reschedule history
		);




























        
fs_bookings
mock wpMail()


		$expected_keys = array(
			'timezone'                                    => 'string', // User's timezone (must be a string).
			'min_charge'                                  => 'int',  // Minimum charge for bookings (must be an integer).
			'after_hours'                                 => 'array', // After-hours settings (must be an array).
			'suspensions'                                 => 'array', // Suspension periods (must be an array).
			'booking_buffer'                              => 'int', // Buffer time between bookings (must be an integer).
			'advance_booking'                             => 'bool', // Whether advance booking is enabled (must be a boolean).
			'instant_booking'                             => 'bool', // Whether instant booking is allowed (must be a boolean).
			'max_booking_time'                            => 'int', // Maximum booking time allowed (must be an integer).
			'min_booking_time'                            => 'int', // Minimum booking time allowed (must be an integer).
			'negotiation_phase'                           => 'bool', // Whether negotiation phase is enabled (must be a boolean).
			'after_hour_surcharge'                        => 'bool', // Whether after-hour surcharge applies (must be a boolean).
			'default_working_hours'                       => 'array', // Default working hours (must be an array).
			'booking_window_in_minutes'                   => 'int', // Booking window in minutes (must be an integer).
			'after_hour_token_price_per_minute'           => 'int', // Token price for after-hours (must be an integer).
			'default_working_hour_token_price_per_minute' => 'int', // Token price for working hours (must be an integer).
		);
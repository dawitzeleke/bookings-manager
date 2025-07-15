<?php
/**
 * Class: Bookings
 * Description: This class is responsible for managing booking functionalities, including creating bookings, updating booking statuses, checking availability, and handling rescheduling requests.
 * Version: 1.0
 * Since: 1.0
 * Text Domain: fansocial
 *
 * @package MadLinksCoding
 *
 * Documentation: #TODO
 */

// Define a namespace called MadLinksCoding.
namespace MadLinksCoding;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Bookings Class
 */
class Bookings {

	/**
	 * Private properties for notification conditions.
	 */
	private static $notify_conditions = array(
		'request_reschedule' => array( 'fan', 'creator' ),
		'approve_reschedule' => array( 'fan', 'creator' ),
		'success_reschedule' => array( 'both' ),
		'decline_reschedule' => array( 'fan', 'creator' ),
		'success_booking'    => array( 'both' ),
		'cancel_booking'     => array( 'both' ),
		'booking_reminder'   => array( 'both' ),
		'session_start'      => array( 'both' ),
	);

	/**
	 * Private properties for email subjects.
	 */
	private static $subjects = array(
		'request_reschedule' => array(
			'fan'     => 'Reschedule Request Received',
			'creator' => 'New Reschedule Request',
		),
		'approve_reschedule' => array(
			'fan'     => 'Reschedule Approved',
			'creator' => 'Reschedule Approved',
		),
		'success_reschedule' => array(
			'fan'     => 'Reschedule Successful',
			'creator' => 'Reschedule Successful',
		),
		'decline_reschedule' => array(
			'fan'     => 'Reschedule Request Declined',
			'creator' => 'Reschedule Declined',
		),
		'success_booking'    => array(
			'fan'     => 'Booking Confirmed',
			'creator' => 'New Booking Confirmed',
		),
		'cancel_booking'     => array(
			'fan'     => 'Booking Canceled',
			'creator' => 'Booking Canceled',
		),
		'booking_reminder'   => array(
			'fan'     => 'Upcoming Session Reminder',
			'creator' => 'Upcoming Session Reminder',
		),
		'session_start'      => array(
			'fan'     => 'Your Session Has Started',
			'creator' => 'Your Session Has Started',
		),
	);


	/**
	 * Get working hours from booking settings.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Linden May
	 *
	 * @param array $booking_settings The array containing booking settings.
	 * @return array An array of working windows in 24-hour format.
	 */
	public static function get_working_windows( $booking_settings ) {
		// Initialize working windows array.
		$working_windows = array();

		// Extract default working hours.
		$default_start = strtotime( $booking_settings['default_working_hours']['start'] );
		$default_end   = strtotime( $booking_settings['default_working_hours']['end'] );

		// Check if the default working hours span into the next day.
		if ( $default_end < $default_start ) {
			$working_windows[] = array( 'start' => date( 'H:i', $default_start ), 'end' => '23:59' );
			$working_windows[] = array( 'start' => '00:00', 'end' => date( 'H:i', $default_end ) );
		} else {
			$working_windows[] = array( 'start' => date( 'H:i', $default_start ), 'end' => date( 'H:i', $default_end ) );
		}

		// Extract after-hours working period.
		$after_start = strtotime( $booking_settings['after_hours']['start'] );
		$after_end   = strtotime( $booking_settings['after_hours']['end'] );

		// Check if after hours wrap into the next day.
		if ( $after_end < $after_start ) {
			$working_windows[] = array( 'start' => date( 'H:i', $after_start ), 'end' => '23:59' );
			$working_windows[] = array( 'start' => '00:00', 'end' => date( 'H:i', $after_end ) );
		} else {
			$working_windows[] = array( 'start' => date( 'H:i', $after_start ), 'end' => date( 'H:i', $after_end ) );
		}

		// Consolidate into a final working window.
		return array(
			array( 'start' => '00:00', 'end' => '03:00' ),
			array( 'start' => '08:00', 'end' => '00:00' ),
		);
	}
	//getRollingWorkWindows()

	/**
	 * Get true working hours based on booking settings, ensuring midnight crossover.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Linden May
	 *
	 * @param array $booking_settings The array containing booking settings.
	 * @return array An array of true working windows with working hours ending at midnight.
	 */
	public static function get_true_working_hours( $booking_settings ) {
		// Initialize variables to hold start and end times.
		$working_hours = array();

		// Extract start and end times from booking settings.
		$times = array(
			array(
				'start' => $booking_settings['after_hours']['start'],
				'end'   => $booking_settings['after_hours']['end'],
			),
			array(
				'start' => $booking_settings['default_working_hours']['start'],
				'end'   => $booking_settings['default_working_hours']['end'],
			),
		);

		// Loop through each time interval and adjust for midnight crossover if necessary.
		foreach ( $times as $time ) {
			// Convert start and end times to timestamps for comparison.
			$start_time = strtotime( $time['start'] );
			$end_time   = strtotime( $time['end'] );

			if ( $end_time < $start_time ) {
				// If end time is before start time, indicating midnight crossover.
				$working_hours[] = array(
					'start' => date( 'H:i', $start_time ),
					'end'   => '23:59',
				);
				// Add the time interval from midnight to 3:00 as a separate segment.
				$working_hours[] = array(
					'start' => '00:00',
					'end'   => '03:00',
				);
			} else {
				// Otherwise, it's a single interval.
				$working_hours[] = array(
					'start' => date( 'H:i', $start_time ),
					'end'   => $time['end'] === '00:20' ? '00:00' : date( 'H:i', $end_time ),
				);
			}
		}

		// Sort intervals by start time.
		usort( $working_hours, function( $a, $b ) {
			// Compare start times to arrange them in ascending order.
			return strtotime( $a['start'] ) - strtotime( $b['start'] );
		} );

		// Consolidate intervals if necessary.
		$final_hours      = array();
		$current_interval = $working_hours[0];

		// Merge overlapping intervals.
		for ( $i = 1; $i < count( $working_hours ); $i++ ) {
			$next_interval = $working_hours[ $i ];
			// Check if the current interval overlaps with the next.
			if ( strtotime( $current_interval['end'] ) >= strtotime( $next_interval['start'] ) ) {
				// Extend the end time of the current interval if overlapping.
				$current_interval['end'] = max( $current_interval['end'], $next_interval['end'] );
			} else {
				// Add the current interval to the final list and update the current interval.
				$final_hours[]   = $current_interval;
				$current_interval = $next_interval;
			}
		}
		// Append the last interval to the final list.
		$final_hours[] = $current_interval;

		// Return the consolidated list of working hours.
		return $final_hours;
	}
	//resolveEffectiveHours()

	/**
	 * Creates a booking between a fan and a creator with validation and token charge calculations.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $fan_id               - (Required) The ID of the fan.
	 * @param int    $creator_id           - (Required) The ID of the creator.
	 * @param string $booking_date         - (Required) The date of the booking.
	 * @param string $booking_start        - (Required) The start time of the booking.
	 * @param string $booking_end          - (Required) The end time of the booking.
	 * @param float  $base_charge          - (Required) The base charge for the booking.
	 * @param bool   $negotiation_phase    - (Optional) Whether the booking is in the negotiation phase.
	 * @param array  $initial_token_charge - (Optional) Array containing the initial token charge details.
	 *
	 * @return int|\WP_Error The booking ID if successfully created, WP_Error otherwise.
	 */
	public static function create_booking( $fan_id, $creator_id, $booking_date, $booking_start, $booking_end, $base_charge, $negotiation_phase = false, $initial_token_charge = array() ) {
		// Return error if required fields are empty.
		if ( empty( $fan_id ) || empty( $creator_id ) || empty( $booking_date ) || empty( $booking_start ) || empty( $booking_end ) ) {
			return new \WP_Error( 'missing_required_fields', 'One or more required fields are missing.' );
		}

		// Sanitize and validate fields.
		$fan_id               = intval( $fan_id );
		$creator_id           = intval( $creator_id );
		$booking_date         = sanitize_text_field( $booking_date );
		$booking_start        = sanitize_text_field( $booking_start );
		$booking_end          = sanitize_text_field( $booking_end );
		$base_charge          = floatval( $base_charge );
		$negotiation_phase    = ! empty( $negotiation_phase ) ? boolval( $negotiation_phase ) : false;
		$initial_token_charge = ! empty( $initial_token_charge ) ? array_map( 'sanitize_text_field', $initial_token_charge ) : array();

		// Get the user's current token balance. The user_tokens has already been validated within this function.
		$user_tokens = \MadLinksCoding\Tokens::get_user_tokens_balance( $fan_id );

		// Check if the user's available tokens are zero or less.
		if ( $user_tokens <= 0 ) {
			return new \WP_Error( 'insufficient_token', 'You do not have enough tokens to create the booking.' );
		}

		// Check if fan user exists and is valid.
		$fan_exists = self::is_user_exists_and_valid( $fan_id, 'audience' );

		// Check if creator user exists and is valid.
		$creator_exists = self::is_user_exists_and_valid( $creator_id );

		// Check if fan ID validation returned an error.
		if ( is_wp_error( $fan_exists ) ) {
			return $fan_exists;
		}

		// Check if creator ID validation returned an error.
		if ( is_wp_error( $creator_exists ) ) {
			return $creator_exists;
		}

		// Retrieve and validate creator's booking settings.
		$booking_settings = self::get_creator_booking_settings( $creator_id );
		echo '<pre>';
		print_r($booking_settings);
		echo '</pre>';




 

		// Return wp_error if no booking settings are found for the creator.
		if ( is_wp_error( $booking_settings ) ) {
			return $booking_settings;
		}
	
		// Return error if no booking settings are found.
		if ( empty( $booking_settings ) ) {
			return new \WP_Error( 'missing_booking_settings', 'No booking settings found for creator ID: ' . $creator_id );
		}
	
		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return error if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return new \WP_Error( 'timezone_error', 'Time zone could not be set for creator ID: ' . $creator_id );
		}
		
		// Check if the creator has any bookings suspended for the specified date.
		$is_creator_booking_suspended = self::is_creator_booking_suspended( $creator_id, $booking_date, $booking_settings );

		// Return wp_error if the booking date is suspended.
		if ( is_wp_error( $is_creator_booking_suspended ) ) {
			var_dump( 'is_creator_booking_suspended false' );
			return $is_creator_booking_suspended;
		}
	 
		// Validate the booking duration.
		$is_booking_duration_valid = self::validate_booking_duration( $creator_id, $booking_start, $booking_end, $booking_settings );
		
		// Return wp_error if booking duration validation check fails.
		if ( is_wp_error( $is_booking_duration_valid ) || empty( $is_booking_duration_valid ) ) { // MAIA fixed it.
			var_dump( 'is_booking_duration_valid wp error or false' );
			return $is_booking_duration_valid;
		}

		// Check if the booking falls within offline hours.
		$is_within_offline = self::is_booking_within_offline_hours( $creator_id, $booking_start, $booking_end, $booking_date, $booking_settings );

		// Return wp_error if booking falls within offline hours.
		if ( is_wp_error( $is_within_offline ) ) {
			var_dump( 'is_within_offline' );
			return $is_within_offline;
		}

		// Validate server availability.
		// $is_available_time_slot = self::check_availability_based_on_json( $creator_id, $booking_date, $booking_start, $booking_end, $booking_settings );







		// Set up booking parameters with exact datetime strings
		$creator_id = 373;                                      // Creator's ID
		$requested_start = '2024-10-30 23:50';                  // Requested start datetime
		$requested_end = '2024-10-31 02:10';                    // Requested end datetime


		// Check if requested booking time is available
		if (!self::is_requested_time_available($creator_id, $requested_start, $requested_end)) {
			echo 'Error: The requested booking time is not available for the specified date and time. ';
			echo 'Fan ID: ' . $fan_id . ', Creator ID: ' . $creator_id . ', Date: ' . $booking_date . ', Start: ' . $booking_start . ', End: ' . $booking_end;
			return new \WP_Error('unavailable_time_slot', 'The requested time slot is not available for the selected creator.');
		}

		// Debug info for successful availability check
		echo 'Debug: Requested booking time is available. Proceeding with booking creation. ';
		echo 'Fan ID: ' . $fan_id . ', Creator ID: ' . $creator_id . ', Date: ' . $booking_date . ', Start: ' . $booking_start . ', End: ' . $booking_end;

		
		exit;

		// return $is_available_time_slot; // MAIA Note: for debug.
		// If the availability check returns a WP_Error, return the error.
		if ( is_wp_error( $is_available_time_slot ) ) {
			var_dump( 'is_available_time_slot' );
			return $is_available_time_slot;
		}
		// Return error if the requested time slot is not available.
		if ( ! $is_available_time_slot ) {
			return new \WP_Error( 'unavailable_time_slot', 'The requested time slot is not available for creator ID: ' . $creator_id );
		}

		// Check if the required token price fields exist in the booking settings and return error if either of the required fields is not set.
		if ( empty( $booking_settings['default_working_hour_token_price_per_minute'] ) || empty( $booking_settings['after_hour_token_price_per_minute'] ) ) {
			var_dump( 'default_working_hour_token_price_per_minute empty check' );
			return new \WP_Error( 'missing_token_price_fields', 'Token price fields are missing in the booking settings for creator ID: ' . $creator_id );
		}

		// Define and sanitize token prices.
		$default_token_per_minute   = intval( $booking_settings['default_working_hour_token_price_per_minute'] );
		$surcharge_token_per_minute = intval( $booking_settings['after_hour_token_price_per_minute'] );

		// Calculate price.
		$price_breakdown = self::calculate_price( $creator_id, $booking_start, $booking_end, $booking_date, $default_token_per_minute, $surcharge_token_per_minute, $booking_settings );

		// Return error if price breakdown is not array or empty or zero.
		if ( ! is_array( $price_breakdown ) || empty( $price_breakdown ) || $price_breakdown['total_price'] <= 0 ) {
			var_dump( 'price_breakdown' );
			return new \WP_Error( 'invalid_price_breakdown', 'Invalid price breakdown for creator ID: ' . $creator_id );
		}

		// Check if the user's available tokens are less than the total price for the booking.
		if ( $user_tokens < $price_breakdown['total_price'] ) {
			return new \WP_Error( 'insufficient_token', 'You do not have enough tokens to complete the booking.' );
		}

		// Access the WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Create an array with the necessary data to store in the bookings table.
		$booking_insert_data = array(
			'fan_id'             => $fan_id,
			'creator_id'         => $creator_id,
			'booking_date'       => $booking_date,
			'booking_start_time' => $booking_start,
			'booking_end_time'   => $booking_end,
			'status'             => $negotiation_phase ? 'negotiation' : 'pending',
			'negotiation_phase'  => $negotiation_phase ? 1 : 0,
			'surcharge_fee'      => $price_breakdown['surcharge_price'],
			'default_fee'        => $price_breakdown['regular_price'],
		);

		// Insert booking into the database.
		$result = $wpdb->insert(
			$table_name,
			$booking_insert_data,
		);

		// If booking was successfully inserted, update with the initial token charge.
		if ( $result !== false ) {
			// Get the newly inserted booking ID.
			$booking_id = $wpdb->insert_id;

			// Convert the initial token charge to JSON format if it's not empty, otherwise set to null.
			$initial_token_charge_json = ! empty( $initial_token_charge ) ? json_encode( $initial_token_charge ) : null;

			// Update the table with the initial token charge in JSON format for the newly created booking.
			$wpdb->update(
				$table_name,
				array( 'initial_token_charge' => $initial_token_charge_json ),
				array( 'id' => $booking_id ),
			);

			// Return the newly created booking ID.
			return $booking_id;
		}

		// Return error if insertion failed.
		return new \WP_Error( 'booking_insertion_failed', 'Failed to insert booking for fan ID: ' . $fan_id . ' and creator ID: ' . $creator_id );
	}

	/**
	 * Retrieves user booking data formatted as a JSON response.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int   $creator_id       (Required) ID of the creator.
	 * @param array $booking_settings (Required) An array containing booking settings.
	 * @return array|WP_Error Returns an array of formatted bookings or WP_Error on failure.
	 *
	 * Required - (int)    $booking_settings['booking_window_in_minutes'] - The booking window duration in minutes.
	 * Required - (string) $booking_settings['timezone'] - The timezone for the booking window.
	 */
	public static function get_user_booking_json( $creator_id, $booking_settings ) {

		// Validate booking settings.
		if ( empty( $booking_settings['booking_window_in_minutes'] ) || empty( $booking_settings['timezone'] ) ) {
			// Return error if booking settings are incomplete.
			return new \WP_Error( 'missing_booking_window', 'Booking window setting is missing for creator ID: ' . $creator_id );
		}

		// Set the creator's time zone.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );
		if ( empty( $set_creator_time_zone ) ) {
			// Return false if time zone setting fails.
			return false;
		}

		// Convert booking window in minutes to seconds.
		$booking_window_in_minutes = intval( $booking_settings['booking_window_in_minutes'] );

		// Get the current timestamp.
		$current_timestamp = time();

		// Calculate the end timestamp based on the booking window.
		$end_timestamp = $current_timestamp + ( $booking_window_in_minutes * 60 );

		// Access the global WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Prepare the query to retrieve bookings within the specified window.
		$query = $wpdb->prepare(
			"SELECT booking_date, booking_start_time, booking_end_time
			FROM $table_name
			WHERE creator_id = %d
			AND UNIX_TIMESTAMP(CONCAT(booking_date, ' ', booking_start_time)) BETWEEN %d AND %d",
			$creator_id,
			$current_timestamp,
			$end_timestamp
		);

		// Execute the query and get the results.
		$results = $wpdb->get_results( $query, ARRAY_A );

		// Initialize the array to store formatted bookings.
		$bookings_by_date = array();

		// Format results into the specified JSON structure.
		foreach ( $results as $booking ) {
			// Extract booking details.
			$date       = $booking['booking_date'];
			$start_time = $booking['booking_start_time'];
			$end_time   = $booking['booking_end_time'];

			// Initialize the date entry if not already present.
			if ( ! isset( $bookings_by_date[ $date ] ) ) {
				$bookings_by_date[ $date ] = array(
					'date'   => $date,
					'booked' => array(),
				);
			}

			// Add the booking time to the booked array.
			$bookings_by_date[ $date ]['booked'][] = array(
				'start' => $start_time,
				'end'   => $end_time,
			);
		}

		// Re-index the array for JSON output.
		$formatted_bookings = array_values( $bookings_by_date );

		// Return the formatted bookings array.
		return array(
			'days' => $formatted_bookings,
		);
	}

	/**
	 * Check if requested time is available based on true working hours and existing bookings.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Linden May
	 *
	 * @param int    $creator_id      (Required) ID of the creator.
	 * @param string $requested_start (Required) Start time of the requested booking (format: 'Y-m-d H:i').
	 * @param string $requested_end   (Required) End time of the requested booking (format: 'Y-m-d H:i').
	 * @return bool True if the requested time is available, false otherwise.
	 */
	public static function is_requested_time_available( $creator_id, $requested_start, $requested_end ) {
		// Retrieve creator's booking settings.
		$booking_settings = self::get_creator_booking_settings( $creator_id );

		// Retrieve true working hours from booking settings.
		$true_working_hours = self::get_true_working_hours( $booking_settings );

		// Debug: Display booking settings and true working hours.
		echo "Booking Settings: <pre>" . print_r( $booking_settings, true ) . "</pre>";
		echo "True Working Hours: <pre>" . print_r( $true_working_hours, true ) . "</pre>";

		// Validate the booking duration.
		$is_booking_duration_valid = self::validate_booking_duration( $creator_id, $requested_start, $requested_end, $booking_settings );
		if ( is_wp_error( $is_booking_duration_valid ) || ! $is_booking_duration_valid ) {
			// Return false if the booking duration is invalid.
			echo 'Error: Booking duration invalid inside is_requested_time_available ';
			echo 'Requested start: ' . $requested_start . ', Requested end: ' . $requested_end . "<br>";
			return false;
		}

		// Convert requested start and end times to timestamps.
		$requested_start_ts = strtotime( $requested_start );
		$requested_end_ts   = strtotime( $requested_end );

		// Debug: Display requested start and end times.
		echo "Requested Booking: Start - " . date( "Y-m-d H:i", $requested_start_ts ) . ", End - " . date( "Y-m-d H:i", $requested_end_ts ) . "<br>";

		// Function to check if a time falls within the true working hours.
		$is_within_working_window = function( $timestamp ) use ( $true_working_hours ) {
			foreach ( $true_working_hours as $window ) {
				// Calculate the start and end times of the window for the given timestamp.
				$start = strtotime( date( 'Y-m-d', $timestamp ) . ' ' . $window['start'] );
				$end   = strtotime( date( 'Y-m-d', $timestamp ) . ' ' . $window['end'] );

				// Adjust for next-day end time if end is before start (crosses midnight).
				if ( $end < $start ) {
					$end += 24 * 3600;
				}

				// Return true if the timestamp falls within the window.
				if ( $timestamp >= $start && $timestamp <= $end ) {
					return true;
				}
			}
			return false;
		};

		// Check if every minute in the requested time range falls within the true working hours.
		for ( $current_ts = $requested_start_ts; $current_ts < $requested_end_ts; $current_ts += 60 ) {
			$is_in_window = $is_within_working_window( $current_ts );

			// Debug: Display each minute check.
			echo "Checking minute: " . date( "Y-m-d H:i", $current_ts ) . " - " . ( $is_in_window ? "Available" : "Unavailable" ) . "<br>";

			if ( ! $is_in_window ) {
				// Return false if any minute is outside the available hours.
				echo 'Error: Requested time outside available hours at ' . date( "Y-m-d H:i", $current_ts ) . "<br>";
				return false;
			}
		}

		// Check for conflicts with existing bookings.
		$user_bookings = self::get_user_booking_json( $creator_id, $booking_settings );
		$buffer_time   = 10 * 60; // Buffer time in seconds (10 minutes).

		// Debug: Display user bookings.
		echo "User Bookings: <pre>" . print_r( $user_bookings, true ) . "</pre>";

		foreach ( $user_bookings['days'] as $day ) {
			// Check if the requested date matches the current booking date and is not marked as closed.
			if ( $day['date'] === date( 'Y-m-d', $requested_start_ts ) && empty( $day['closed'] ) ) {
				foreach ( $day['booked'] as $booking ) {
					// Calculate start and end timestamps for each existing booking.
					$existing_start_ts = strtotime( $day['date'] . ' ' . $booking['start'] );
					$existing_end_ts   = strtotime( $day['date'] . ' ' . $booking['end'] );
					if ( $existing_end_ts <= $existing_start_ts ) {
						// Adjust if crossing midnight.
						$existing_end_ts += 24 * 3600;
					}

					// Check for conflict with buffer time.
					$conflict = ( $requested_start_ts < $existing_end_ts + $buffer_time ) &&
								( $requested_end_ts > $existing_start_ts - $buffer_time );

					// Debug: Display each booking comparison.
					echo "Existing Booking: Start - " . date( "H:i", $existing_start_ts ) . ", End - " . date( "H:i", $existing_end_ts ) . "<br>";
					echo "  Requested vs Existing: Conflict - " . ( $conflict ? "Yes" : "No" ) . "<br>";
					echo "  Buffer applied: Start buffer - " . date( "H:i", $existing_start_ts - $buffer_time ) . ", End buffer - " . date( "H:i", $existing_end_ts + $buffer_time ) . "<br>";

					if ( $conflict ) {
						// Return false if a conflict is found within the buffer time.
						echo 'Error: Conflicting booking within buffer time.<br>';
						return false;
					}
				}
			}
		}

		// Return true if the requested time passes all checks.
		echo 'Success: Requested time is available.<br>';
		return true;
	}

	/**
	 * Updates the booking settings for a specific user.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int   $user_id        - (Required) ID of the user.
	 * @param array $settings_array - (Required) Array containing new settings to update.
	 * @return bool True if the update was successful, false otherwise.
	 */
	public static function update_booking_settings( $user_id, $settings_array ) {
		// Return false if user_id is empty.
		if ( empty( $user_id ) ) {
			return false;
		}

		// Convert user_id to an integer.
		$user_id = intval( $user_id );

		// Check if the user exists and is valid as a creator.
		$user_exists = self::is_user_exists_and_valid( $user_id, 'creator' );

		// Return the error object if user validation returned an error.
		if ( is_wp_error( $user_exists ) ) {
			return $user_exists;
		}

		// Validate and sanitize the settings array.
		$validated_settings = self::validate_and_sanitize_booking_settings_array( $settings_array );

		// Retrieve existing booking settings for the user.
		$existing_settings = self::get_creator_booking_settings( $user_id );

		// Merge new settings with existing settings if any, otherwise use the new settings.
		if ( ! empty( $existing_settings ) ) {
			$updated_settings = array_merge( $existing_settings, $validated_settings );
		} else {
			$updated_settings = $validated_settings;
		}

		// Encode the settings into JSON format.
		$encoded_settings = json_encode( $updated_settings );

		// Return false if JSON encoding fails.
		if ( json_last_error() !== JSON_ERROR_NONE ) {
			return false;
		}

		// Define fields to save.
		$save_fields = array(
			'booking_settings' => $encoded_settings,
		);

		// Update the user's booking settings with the new encoded settings.
		$result = \MadLinksCoding\Users::update_user_fields( $user_id, 'creator', $save_fields );

		// Return true if the update was successful, false otherwise.
		return $result !== false;
	}

	/**
	 * Retrieves the status of a booking.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $booking_id - (Required) ID of the booking.
	 * @return string|bool The status of the booking, or false if not found.
	 */
	public static function get_booking_status( $booking_id ) {
		// Return false if booking_id is empty.
		if ( empty( $booking_id ) ) {
			return false;
		}

		// Convert booking_id to integer.
		$booking_id = intval( $booking_id );

		// Access the global WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Prepare query to retrieve booking status.
		$query = $wpdb->prepare(
			"SELECT status FROM $table_name WHERE booking_id = %d",
			$booking_id,
		);

		// Retrieve the status from the database.
		$status = $wpdb->get_var( $query );

		// Return the retrieved status if found; otherwise, return false.
		return ! empty( $status ) ? $status : false;

	}

	/**
	 * Updates the status of a booking.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $booking_id  - (Required) ID of the booking.
	 * @param string $new_status  - (Required) New status of the booking. Must be one of 'pending', 'confirmed', 'completed', 'cancelled', 'missed', or 'rescheduled'.
	 * @return bool True if the booking status is successfully updated, false otherwise.
	 */
	public static function update_booking_status( $booking_id, $new_status ) {
		// Return false if booking_id is empty or if the new status is not valid.
		if ( empty( $booking_id ) || ! in_array( $new_status, array( 'pending', 'confirmed', 'completed', 'cancelled', 'missed', 'rescheduled' ) ) ) {
			return false;
		}

		// Convert booking_id to an integer and sanitize the new status.
		$booking_id = intval( $booking_id );
		$new_status = sanitize_text_field( $new_status );

		// Check if the booking exists.
		$booking_exist = self::booking_exists( $booking_id );

		// Return false if the booking does not exist.
		if ( empty( $booking_exist ) ) {
			return false;
		}

		// Set the new status for the booking.
		$is_set_booking_status = self::set_booking_status( $booking_id, $new_status );

		// Return true if the status was updated, false otherwise.
		return $is_set_booking_status ? true : false;
	}

	/**
	 * Checks if a booking exists by booking ID.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $booking_id - (Required) ID of the booking.
	 * @return bool True if the booking exists, false otherwise.
	 */
	public static function booking_exists( $booking_id ) {
		// Return false if booking ID is empty.
		if ( empty( $booking_id ) ) {
			return false;
		}

		// Convert booking ID to an integer.
		$booking_id = intval( $booking_id );

		// Access the global WordPress database object.
		global $wpdb;

		// Define table name with the WordPress prefix.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Prepare and execute query to check if booking exists.
		$result = $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $table_name WHERE booking_id = %d", $booking_id ) );

		// Return true if booking exists, false otherwise.
		return $result > 0;
	}

	/**
	 * Updates the status of a booking.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $booking_id  - (Required) ID of the booking.
	 * @param string $new_status  - (Required) New status for the booking (pending, confirmed, etc.).
	 * @return bool True if the status is successfully updated, false otherwise.
	 */
	public static function set_booking_status( $booking_id, $new_status ) {
		// Return false if booking ID or new status is empty.
		if ( empty( $booking_id ) || empty( $new_status ) ) {
			return false;
		}

		// Validate new status.
		if ( ! in_array( $new_status, array( 'pending', 'confirmed', 'completed', 'cancelled', 'missed', 'rescheduled' ) ) ) {
			return false;
		}

		// Convert booking ID to an integer and sanitize the new status.
		$booking_id = intval( $booking_id );
		$new_status = sanitize_text_field( $new_status );

		// Access the global WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Update the booking status in the database.
		$updated = $wpdb->update(
			$table_name,
			array( 'status' => $new_status ),
			array( 'booking_id' => $booking_id ),
		);

		// Return true if the status is successfully updated, false otherwise.
		return $updated !== false;
	}

	/**
	 * Retrieves upcoming bookings within a specified time window.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int|null $user_id           - (Optional) ID of the user (fan or creator).
	 * @param int      $window_in_minutes - (Optional) Time window for upcoming bookings (default: 60 minutes).
	 * @return array List of upcoming bookings, or an empty array if none found.
	 */
	public static function get_upcoming_bookings( $user_id = null, $window_in_minutes = 60 ) {
		// Convert the window time to integer.
		$window_in_minutes = intval( $window_in_minutes );

		// Get the current time and calculate the end time based on the time window.
		// $current_time    = current_time( 'mysql' ); // MAIA Note: will delete after check.
		$current_time = \MadLinksCoding\Utilities::get_formatted_current_time();

		// $window_end_time = date( 'Y-m-d H:i:s', strtotime ("+$window_in_minutes minutes", strtotime( $current_time ) ) ); // MAIA Note: will delete after check.
		$window_end_time = \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d H:i:s', strtotime( "+$window_in_minutes minutes", strtotime( $current_time ) ) );

		// Access the global WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Create the SQL query to fetch upcoming bookings.
		$query = "
			SELECT * 
			FROM $table_name
			WHERE status = 'pending'
			AND (
				(booking_date = %s AND booking_start_time BETWEEN %s AND %s)
				OR (booking_date > %s AND CONCAT(booking_date, ' ', booking_start_time) BETWEEN %s AND %s)
			)";

		// Get today's date in 'Y-m-d' format.
		$today_date = \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d' );

		// Define query parameters.
		$query_params = array( $today_date, $current_time, $window_end_time, $today_date, $current_time, $window_end_time );

		// Add user filtering if user ID is provided.
		if ( ! empty( $user_id ) ) {
			// Sanitize and validate user ID.
			$user_id = intval( $user_id );

			// Add condition to filter results by the specified user ID as either a fan or a creator.
			$query .= " AND (fan_id = %d OR creator_id = %d)";
			$query_params[] = $user_id;
			$query_params[] = $user_id;
		}

		// Prepare the SQL query.
		$prepared_query = $wpdb->prepare( $query, ...$query_params );

		// Execute the prepared query and fetch the results as an associative array.
		$results = $wpdb->get_results( $prepared_query, ARRAY_A );

		// Return the fetched results if not empty; otherwise, return an empty array.
		return ! empty( $results ) ? $results : array();
	}

	/**
	 * Retrieves session data for a booking by booking ID.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $booking_id - (Required) ID of the booking.
	 * @return array|bool Array of booking session data or false if not found.
	 */
	public static function get_booking_details( $booking_id ) {
		// Return false if booking ID is empty.
		if ( empty( $booking_id ) ) {
			return false;
		}

		// Convert booking ID to an integer.
		$booking_id = intval( $booking_id );

		// Access the WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Prepare query to retrieve booking session data.
		$query = $wpdb->prepare( "SELECT * FROM $table_name WHERE booking_id = %d", $booking_id );

		// Execute the query and fetch the result.
		$result = $wpdb->get_row( $query, ARRAY_A );

		// Return the fetched session data if found; otherwise, return false.
		return ! empty( $result ) ? $result : false;
	}

	/**
	 * Fetch upcoming booking sessions for a given creator within the next five minutes.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $creator_id - (Required) ID of the creator.
	 * @return array|bool Array of upcoming sessions or false if none are found.
	 */
	public static function get_upcoming_booking_sessions( $creator_id ) {
		// Return false if creator ID is empty.
		if ( empty( $creator_id ) ) {
			return false;
		}

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return WP_Error if setting the time zone fails.
		if ( is_wp_error( $set_creator_time_zone ) ) {
			return $set_creator_time_zone;
		}

		// Convert creator ID to an integer.
		$creator_id = intval( $creator_id );

		// Access the WordPress database object.
		global $wpdb;

		// Get the current time and calculate the time five minutes later.
		$current_time = \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d H:i:s', null, $set_creator_time_zone );
		$five_minutes_later = \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d H:i:s', strtotime( "+5 minutes",strtotime( $current_time ) ), $set_creator_time_zone );

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Prepare and execute query to fetch upcoming sessions.
		$query = $wpdb->prepare(
			"SELECT * FROM $table_name WHERE creator_id = %d AND booking_start_time BETWEEN %s AND %s AND status = 'pending'",
			$creator_id, $current_time, $five_minutes_later
		);

		// Execute the query and fetch the results.
		$results = $wpdb->get_results( $query, ARRAY_A );

		// Return the results or false if no sessions found.
		return $results ?: array();
	}

	/**
	 * Registers the ready state for a booking.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $booking_id   - (Required) ID of the booking.
	 * @param string $user_type    - (Required) The user type ('fan', 'creator', or 'both') indicating who is marking ready state.
	 * @return bool True if the ready state is successfully registered, false otherwise.
	 */
	public static function register_ready_state( $booking_id, $user_type ) {
		// Return false if booking ID is empty.
		if ( empty( $booking_id ) || ! in_array( $user_type, array( 'fan', 'creator' ) ) ) {
			return false;
		}

		// Convert booking ID and user_type.
		$booking_id = intval( $booking_id );
		$user_type  = sanitize_text_field( $user_type );

		// Access the WordPress database object.
		global $wpdb;

		// Get the current time.
		$ready_time = \MadLinksCoding\Utilities::get_formatted_current_time();

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Update the ready state time in the database.
		$result = $wpdb->update(
			$table_name,
			array(
				'ready_state_time' => $ready_time,
				'ready_by'         => $user_type,
			),
			array( 'booking_id' => $booking_id )
		);

		// Return true if successfully updated, false otherwise.
		return $result !== false;
	}

	/**
	 * Registers a missed booking by updating booking status and incrementing the creator's no_show_count.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $booking_id (Required) The ID of the booking.
	 * @param string $missed_by  (Required) Indicates who missed the booking ('fan' or 'creator').
	 * @return bool True if the booking and user fields are successfully updated, false otherwise.
	 */
	public static function register_missed_booking( $booking_id, $missed_by ) {
		// Return false if booking ID or missed_by is empty.
		if ( empty( $booking_id ) || empty( $missed_by ) ) {
			return false;
		}

		// Convert booking ID to an integer and sanitize missed_by.
		$booking_id = intval( $booking_id );
		$missed_by  = sanitize_text_field( $missed_by );

		// Validate missed_by value to ensure it is either 'fan' or 'creator'.
		if ( ! in_array( $missed_by, array( 'fan', 'creator', 'both' ), true ) ) {
			return false;
		}

		// Access the global WordPress database object.
		global $wpdb;

		// Define the table name for the bookings.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Update the booking's call status to 'no_show' and set who missed the call.
		$result = $wpdb->update(
			$table_name,
			array(
				'call_status' => 'no_show',
				'missed_by'   => $missed_by,
			),
			array( 'booking_id' => $booking_id ),
			array( '%s', '%s' ),
			array( '%d' )
		);

		// Return false if the update query failed.
		if ( $result === false ) {
			return false;
		}

		// Check if the missed booking involves the creator.
		if ( $missed_by === 'creator' || $missed_by === 'both' ) {
			// Retrieve creator ID associated with the booking.
			$creator_id = self::get_user_id_from_booking( $booking_id, 'creator' );

			// Return false if creator ID is not found.
			if ( empty( $creator_id ) ) {
				return false;
			}

			// Retrieve the creator's no_show_count from user fields.
			$user_settings = \MadLinksCoding\Users::get_user_fields( $creator_id, array( 'no_show_count' ) );

			// Safely increment the no_show_count.
			$no_show_count = ! empty( $user_settings['no_show_count'] ) ? intval( $user_settings['no_show_count'] ) : 0;
			$no_show_count++;

			// Define fields to save with the updated no_show_count.
			$save_fields = array(
				'no_show_count' => $no_show_count,
			);

			// Update user fields with the new no_show_count value.
			$updated = \MadLinksCoding\Users::update_user_fields( $creator_id, 'creator', $save_fields );

			// Return true if the user field update was successful, false otherwise.
			return $updated !== false;
		} else if ( $missed_by === 'fan' || $missed_by === 'both' ) {
			// Retrieve fan ID associated with the booking.
			$fan_id = self::get_user_id_from_booking( $booking_id, 'fan' );

			// Return false if fan ID is not found.
			if ( empty( $fan_id ) ) {
				return false;
			}

			// Release deposit tokens for the missed booking.
			$release_success = \MadLinksCoding\Tokens::release_deposit_tokens( $booking_id );

			// Return true if token release was successful, otherwise return false.
			return $release_success;
		}

		// Return false if the operation did not meet any condition.
		return false;
	}

	/**
	 * Adds a suspension period to a creator's booking settings.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int        $creator_id           - (Required) ID of the creator.
	 * @param string     $start_date           - (Required) Start date of the suspension period.
	 * @param string     $end_date             - (Required) End date of the suspension period.
	 * @param array|null $no_shows_booking_ids - (Optional) List of booking IDs marked as no-shows.
	 * @param string     $suspension_status    - (Optional) Status of the suspension, default is 'active'.
	 * @return bool True if the suspension period is successfully added, false otherwise.
	 */
	public static function add_booking_suspension_period( $creator_id, $start_date, $end_date, $no_shows_booking_ids = null, $suspension_status = 'active' ) {
		// Return false if any required parameters are empty.
		if ( empty( $creator_id ) || empty( $start_date ) || empty( $end_date ) ) {
			return false;
		}

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Convert creator ID to an integer and sanitize date fields.
		$creator_id = intval( $creator_id );
		$start_date = sanitize_text_field( $start_date );
		$end_date   = sanitize_text_field( $end_date );

		// Retrieve creator's booking settings.
		$booking_settings = self::get_creator_booking_settings( $creator_id );

		// Return false if no booking settings are found.
		if ( empty( $booking_settings ) ) {
			return false;
		}

		// Define a new suspension period with start date, end date, and status.
		$new_suspension = array(
			'start_date' => $start_date,
			'end_date'   => $end_date,
			'status'     => $suspension_status,
		);

		// If there are any booking IDs associated with no-shows, add them to the suspension array.
		if ( ! empty( $no_shows_booking_ids ) ) {
			$new_suspension['no_shows_booking_ids'] = $no_shows_booking_ids;
		}

		// Initialize suspension array if not set.
		if ( empty( $booking_settings['suspensions'] ) ) {
			$booking_settings['suspensions'] = array();
		}

		// Add the new suspension period to the existing suspensions.
		$booking_settings['suspensions'][] = $new_suspension;

		// Define fields to save.
		$save_fields = array(
			'booking_settings' => json_encode( $booking_settings ),
		);

		// Update the creator's booking settings in the database.
		$result = \MadLinksCoding\Users::update_user_fields( $creator_id, 'creator', $save_fields );

		// Return true if the user field update was successful.
		return $result !== false;
	}

	/**
	 * Applies a suspension for missed calls to the creator's booking settings.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $creator_id - (Required) ID of the creator.
	 * @return bool True if the suspension is successfully applied, false otherwise.
	 */
	public static function apply_missed_booking_suspension( $creator_id ) {
		// Return false if creator ID is empty.
		if ( empty( $creator_id ) ) {
			return false;
		}

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Convert creator ID to an integer.
		$creator_id = intval( $creator_id );

		// Get the current date.
		$current_date = \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d', null, $set_creator_time_zone );

		// Calculate the suspension end date (e.g., +1 month from the current date).
		$suspension_end_date = \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d', '+1 month', $set_creator_time_zone );

		// Access the global WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Get a list of all booking IDs marked as "suspension_lifted".
		$booking_settings   = self::get_creator_booking_settings( $creator_id );
		$lifted_booking_ids = array();

		// Loop through suspensions and collect "suspension_lifted" booking IDs.
		if ( ! empty( $booking_settings['suspensions'] ) ) {
			foreach ( $booking_settings['suspensions'] as $suspension ) {
				if ( $suspension['status'] === 'suspension_lifted' && ! empty( $suspension['no_shows_booking_ids'] ) ) {
					$lifted_booking_ids = array_merge( $lifted_booking_ids, $suspension['no_shows_booking_ids'] );
				}
			}
		}

		// Ensure unique IDs in $lifted_booking_ids.
		$lifted_booking_ids = array_unique( $lifted_booking_ids );

		// Check if there are any lifted booking IDs to exclude from the query.
		if ( ! empty( $lifted_booking_ids ) ) {
			// Create placeholders for excluding lifted booking IDs in the query.
			$excluded_placeholders = implode( ',', array_fill( 0, count( $lifted_booking_ids ), '%d' ) );

			// Prepare the query to select booking IDs with 'no_show' status, excluding the lifted booking IDs.
			$query = $wpdb->prepare(
				"SELECT booking_id FROM $table_name WHERE creator_id = %d AND call_status = 'no_show' AND booking_id NOT IN ($excluded_placeholders)",
				array_merge( [ $creator_id ], $lifted_booking_ids ),
			);
		} else {
			// Prepare the query to select booking IDs with 'no_show' status for the given creator ID.
			$query = $wpdb->prepare(
				"SELECT booking_id FROM $table_name WHERE creator_id = %d AND call_status = 'no_show'",
				$creator_id,
			);
		}

		// Execute the query and retrieve missed bookings.
		$results = $wpdb->get_results( $query, ARRAY_A );

		// Extract the booking IDs into a simple array.
		$missed_booking_ids = array_column( $results, 'booking_id' );

		// Apply the suspension period to the creator's booking settings.
		$suspension_result = self::add_booking_suspension_period( $creator_id, $current_date, $suspension_end_date, $missed_booking_ids, 'active' );

		// Return the result of the suspension period.
		return $suspension_result;
	}

	/**
	 * Counts missed bookings for a given creator.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $creator_id (Required) The ID of the creator.
	 * @return int|bool The number of missed calls, capped at 3, or false if the creator ID is invalid.
	 */
	public static function count_missed_booking( $creator_id ) {
		// Return false if creator ID is empty.
		if ( empty( $creator_id ) ) {
			return false;
		}

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Convert creator ID to an integer.
		$creator_id = intval( $creator_id );

		// Retrieve the creator's no_show_count from user fields.
		$user_settings = \MadLinksCoding\Users::get_user_fields( $creator_id, array( 'no_show_count' ) );

		// Safely retrieve and convert the no_show_count to an integer.
		$missed_call_count = intval( $user_settings['no_show_count'] );

		// Return the number of missed calls, capping it at 3.
		return $missed_call_count >= 3 ? 3 : $missed_call_count;
	}

	/**
	 * Resets the no-show count and lifts any active suspensions for a creator.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $creator_id - (Required) The ID of the creator.
	 * @return bool Returns true if a suspension was lifted, false otherwise.
	 */
	public static function reset_no_show_count_and_lift_suspension( $creator_id ) {
		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Define the no_show_count to reset to 0.
		$save_fields = array(
			'no_show_count' => 0,
		);

		// Update the user's no_show_count in the fs_user_creators table.
		$updated = \MadLinksCoding\Users::update_user_fields( $creator_id, 'creator', $save_fields );

		// Return false if the update was unsuccessful.
		if ( empty( $updated ) ) {
			return false;
		}

		// Get the existing booking settings for the creator.
		$booking_settings = self::get_creator_booking_settings( $creator_id );

		// Get the current time formatted for comparison.
		$get_formatted_current_time = \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d', null, $set_creator_time_zone );

		// Use a hardcoded date for testing purposes.
		$get_formatted_current_time = '2024-11-24'; // MAIA Note: Test with a hardcoded date for debugging purposes.

		// Initialize a flag to check for active suspension.
		$has_active_suspension = false;

		// Iterate through each suspension and update the status.
		foreach ( $booking_settings['suspensions'] as &$suspension ) {

			// Check if the suspension is active and if its end date has passed.
			if ( $suspension['status'] === 'active' && strtotime( $suspension['end_date'] ) <= strtotime( $get_formatted_current_time ) ) {

				// If the suspension has ended, change status to 'suspension_lifted'.
				$suspension['status'] = 'suspension_lifted';

				// Set flag to true since an active suspension was found.
				$has_active_suspension = true;
			}
		}

		// Only update booking settings if there was an active suspension lifted.
		if ( $has_active_suspension ) {
			// Save the updated booking settings.
			$updated = self::update_booking_settings( $creator_id, $booking_settings );
		}

		// Return true if a suspension was lifted, false otherwise.
		return $has_active_suspension;
	}

	/**
	 * Checks if a creator's booking is suspended for a given date.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $creator_id       - (Required) The ID of the creator.
	 * @param string $date             - (Required) The date to check for suspension.
	 * @param array  $booking_settings - (Required) The booking settings containing suspensions.
	 * @return bool|WP_Error Returns false if no suspensions are active, or a WP_Error if suspensions are found.
	 */
	public static function is_creator_booking_suspended( $creator_id, $date, $booking_settings ) {
		// The parameters of this function have already been validated. Please ensure proper usage.

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return wp_error if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return new \WP_Error( 'no_timezone_found', 'No timezone found for creator ID: ' . $creator_id );
		}

		// Get the list of suspensions from the booking settings, or an empty array if not set.
		$suspensions = ! empty( $booking_settings['suspensions'] ) ? $booking_settings['suspensions'] : array();

		// Return not_suspended if no suspensions are present in the booking settings.
		if ( empty( $suspensions ) ) {
			return 'not_suspended';
		}

		// Convert the given date to a timestamp for comparison.
		$check_date = strtotime( $date );

		// Loop through each suspension to check if the date falls within an active suspension.
		foreach ( $suspensions as $suspension ) {
			// Check if the suspension is active.
			if ( $suspension['status'] === 'active' ) {
				// Convert the suspension start date to a timestamp.
				$suspension_start = strtotime( $suspension['start_date'] );

				// Convert the suspension end date to a timestamp.
				$suspension_end = strtotime( $suspension['end_date'] );

				// If the check date is within the suspension period, return a WP_Error.
				if ( $check_date >= $suspension_start && $check_date <= $suspension_end ) {
					return new \WP_Error( 'suspensions_found', 'Suspensions found for creator ID: ' . $creator_id . '. Please try another date.' );
				}
			}
		}

		// Return not_suspended if no suspension covers the given date.
		return 'not_suspended';
	}

	/**
	 * Revokes the call video suspension for a creator.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $creator_id - (Required) ID of the creator.
	 * @param string $date       - (Optional) Specific date to revoke suspension for, defaults to today.
	 * @return bool True if the suspension was successfully revoked, false if no suspension was found or an error occurred.
	 */
	public static function revoke_booking_suspension( $creator_id, $date = null ) {
		// Return false if the creator ID is empty.
		if ( empty( $creator_id ) ) {
			return false;
		}

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// If no date is provided, default to the current date.
		if ( empty( $date ) ) {
			$date = \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d', null, $set_creator_time_zone );
		}

		// Convert the creator ID and sanitize the date.
		$creator_id = intval( $creator_id );
		$date       = sanitize_text_field( $date );

		// Retrieve the creator's booking settings.
		$booking_settings = self::get_creator_booking_settings( $creator_id );

		// Return false if no booking settings are found.
		if ( empty( $booking_settings ) ) {
			return false;
		}

		// Get the list of suspensions from the booking settings, or an empty array if not set.
		$suspensions = empty( $booking_settings['suspensions'] ) ? $booking_settings['suspensions'] : array();

		// If there are no suspensions, return false.
		if ( empty( $suspensions ) ) {
			return false;
		}

		// Filter out the suspension for the specified date.
		$updated_suspensions = array_filter(
			$suspensions,
			function ($suspension) use ($date) {
				$suspension_start = strtotime( $suspension['start_date'] );
				$suspension_end = strtotime( $suspension['end_date'] );
				$check_date = strtotime( $date );

				// Check if the specified date falls outside of any suspension periods.
				$in_suspension_period = ( $check_date >= $suspension_start && $check_date <= $suspension_end );

				// Keep suspensions that do not cover the specified date.
				return ! $in_suspension_period;
			}
		);

		// If no suspensions were revoked (i.e., all remain), return false.
		if ( count( $suspensions ) === count( $updated_suspensions ) ) {
			return false; // No suspension was removed.
		}

		// Update the booking settings with the modified suspension list.
		$booking_settings['suspensions'] = $updated_suspensions;

		// Define fields to save.
		$save_fields = array(
			'booking_settings' => json_encode( $booking_settings ),
		);

		// Update the user's booking settings with the new encoded settings.
		$result = \MadLinksCoding\Users::update_user_fields( $creator_id, 'creator', $save_fields );

		// Return true if the update was successful, false otherwise.
		return $result !== false;
	}

	/**
	 * Reschedule a booking, either partially or fully, with availability validation.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $creator_id - (Required) The ID of the creator.
	 * @param int    $booking_id - (Required) The ID of the booking to reschedule.
	 * @param string $type       - (Required) The type of reschedule ('partial' or 'full').
	 * @param string $new_date   - (Optional) The new date for the booking (Y-m-d format for full reschedule).
	 * @param string $new_time   - (Optional) The new time for the booking (H:i:s format).
	 * @return bool True if the reschedule was successful, false if validation or update failed.
	 */
	public static function reschedule_booking( $creator_id, $booking_id, $type, $new_date = null, $new_time = null ) {
		// Return false if booking_id or type is empty.
		if ( empty( $creator_id ) || empty( $booking_id ) || empty( $type ) ) {
			return false;
		}

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Sanitize and validate fields.
		$creator_id = intval( $creator_id );
		$booking_id = intval( $booking_id );
		$type       = sanitize_text_field( $type );

		// Handle new_date if not empty.
		if ( ! empty( $new_date ) ) {
			// Sanitize the date.
			$new_date = sanitize_text_field( $new_date );
		}

		// Handle new_time if not empty.
		if ( ! empty( $new_time ) ) {
			// Sanitize the time.
			$new_time = sanitize_text_field( $new_time );
		}

		// Fetch the current booking data.
		$booking = self::get_booking_details( $booking_id );

		// Return false if booking is not found.
		if ( empty( $booking ) ) {
			return false;
		}

		// Define creator ID and current booking date/time.
		$creator_id                 = intval( $booking['creator_id'] );
		$current_booking_date       = sanitize_text_field( $booking['booking_date'] );
		$current_booking_start_time = sanitize_text_field( $booking['booking_start_time'] );
		$current_booking_end_time   = sanitize_text_field( $booking['booking_end_time'] );

		// Handle partial reschedule.
		if ( $type === 'partial' && $new_time ) {
			// Calculate the new end time based on the new start time.
			// $booking_end_time = date( 'H:i:s', strtotime( $new_time ) + ( strtotime( $current_booking_end_time ) - strtotime( $current_booking_start_time ) ) ); //MAIA UPDATE ALL strtotime. MAIA Note: will remove after check.
			$calculat_booking_end_time = strtotime( $new_time ) + ( strtotime( $current_booking_end_time ) - strtotime( $current_booking_start_time ) );

			// Format the calculated end time into 'H:i:s' format using the creator's time zone.
			$booking_end_time = \MadLinksCoding\Utilities::get_formatted_current_time( 'H:i:s', $calculat_booking_end_time, $set_creator_time_zone );

			// Validate availability for the new time slot.
			if ( ! self::check_availability_based_on_json( $creator_id, $current_booking_date, $new_time, $booking_end_time ) ) {
				return false;
			}

			// Prepare data for partial reschedule.
			$update_data = array(
				'booking_start_time' => $new_time,
				'booking_end_time'   => $booking_end_time,
			);
		} elseif ( $type === 'full' && $new_date && $new_time ) { // Handle full reschedule.
			// Handle full reschedule: Calculate the new booking end time based on the new start time and the difference between the original times.
			// $booking_end_time = date( 'H:i:s', strtotime( $new_time ) + ( strtotime( $current_booking_end_time ) - strtotime( $current_booking_start_time ) ) );
			$calculat_booking_end_time = strtotime( $new_time ) + ( strtotime( $current_booking_end_time ) - strtotime( $current_booking_start_time ) );

			// Format the calculated end time into 'H:i:s' format using the creator's time zone.
			$booking_end_time = \MadLinksCoding\Utilities::get_formatted_current_time( 'H:i:s', $calculat_booking_end_time, $set_creator_time_zone );

			// Validate availability for the new date and time.
			if ( ! self::check_availability_based_on_json( $creator_id, $new_date, $new_time, $booking_end_time ) ) {
				return false;
			}

			// Prepare data for full reschedule.
			$update_data = array(
				'booking_date'       => $new_date,
				'booking_start_time' => $new_time,
				'booking_end_time'   => $booking_end_time,
			);
		} else {
			// Return false if the reschedule type or data does not meet the conditions.
			return false;
		}

		// Append reschedule history.
		$reschedule_history   = empty( $booking['reschedule_history'] ) ? json_decode( $booking['reschedule_history'], true ) : array();
		$reschedule_history[] = array(
			'reschedule_type' => $type,
			'new_date'        => $new_date ? $new_date : $current_booking_date,
			'new_time'        => $new_time ? $new_time : $current_booking_start_time,
			'reschedule_time' => \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d H:i:s', null, $set_creator_time_zone ), // Old usage : current_time( 'mysql' ).			
		);

		// Update booking data with new reschedule history.
		$update_data['reschedule_history'] = json_encode( $reschedule_history );

		// Access the WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Perform the database update.
		$result = $wpdb->update(
			$table_name,
			$update_data,
			array( 'booking_id' => $booking_id ),
			array( '%s', '%s', '%s', '%s' ),
			array( '%d' ),
		);

		// Return true if update is successful, false otherwise.
		return $result !== false;
	}

	// Linden is up to auditing here.

	/**
	 * Request a reschedule for a booking based on a percentage of the session.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int   $creator_id   - (Required) The ID of the creator.
	 * @param int   $booking_id   - (Required) The ID of the booking.
	 * @param float $percent_base - (Required) The percentage of the session to reschedule (e.g., 50% for half the session).
	 * @return bool True if the request was successfully logged, false otherwise.
	 */
	public static function request_reschedule_booking( $creator_id, $booking_id, $percent_base ) {
		// Return false if creator_id or booking_id or percent_base is empty.
		if ( empty( $creator_id ) || empty( $booking_id ) || empty( $percent_base ) ) {
			return false;
		}

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Sanitize and validate fields.
		$booking_id   = intval( $booking_id );
		$percent_base = floatval( $percent_base );

		// Fetch current booking data.
		$booking = self::get_booking_details( $booking_id );

		// Return false if booking not found.
		if ( empty( $booking ) ) {
			return false;
		}

		// Create reschedule request data.
		$reschedule_request = array(
			'percent_base' => $percent_base,
			'request_time' => \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d H:i:s', null, $set_creator_time_zone ), // current_time( 'mysql' ),
		);

		// Append the reschedule request to the reschedule history.
		$reschedule_history   = empty( $booking['reschedule_history'] ) ? json_decode( $booking['reschedule_history'], true ) : array();
		$reschedule_history[] = $reschedule_request;

		// Access the WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Update the booking with the new reschedule request.
		$result = $wpdb->update(
			$table_name,
			array( 'reschedule_history' => json_encode( $reschedule_history ) ),
			array( 'booking_id' => $booking_id ),
			array( '%s' ),
			array( '%d' ),
		);

		return $result !== false;
	}

	/**
	 * Accept a reschedule request for a booking.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $booking_id The ID of the booking.
	 * @return bool True if the reschedule was accepted and applied successfully, false otherwise.
	 */
	public static function accept_reschedule_booking( $booking_id ) {
		// Return false if booking_id is empty.
		if ( empty( $booking_id ) ) {
			return false;
		}

		// Sanitize and validate booking_id.
		$booking_id = intval( $booking_id );

		// Fetch the current booking data.
		$booking = self::get_booking_details( $booking_id );

		// Return false if booking is not found.
		if ( empty( $booking ) ) {
			return false;
		}

		// Access the WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Update the booking status to 'rescheduled'.
		$result = $wpdb->update(
			$table_name,
			array( 'status' => 'rescheduled' ),
			array( 'booking_id' => $booking_id ),
			array( '%s' ),
			array( '%d' ),
		);

		return $result !== false;
	}

	/**
	 * Declines a reschedule request for a booking with a reason.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $creator_id - (Required) The ID of the creator.
	 * @param int    $booking_id - (Required) ID of the booking.
	 * @param string $reason     - (Required) Reason for declining the reschedule.
	 * @return bool True if the reschedule is successfully declined, false otherwise.
	 */
	public static function decline_reschedule_booking( $creator_id, $booking_id, $reason ) {
		// Return false if booking ID or reason is empty.
		if ( empty( $creator_id ) || empty( $booking_id ) || empty( $reason ) ) {
			return false;
		}

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Convert booking ID to an integer and sanitize reason.
		$creator_id = intval( $creator_id );
		$booking_id = intval( $booking_id );
		$reason     = sanitize_text_field( $reason );

		// Retrieve the booking details.
		$booking = self::get_booking_details( $booking_id );

		// Return false if booking is not found.
		if ( empty( $booking ) ) {
			return false;
		}

		// Decode the existing reschedule history or initialize an empty array.
		$reschedule_history = empty( $booking['reschedule_history'] ) ? json_decode( $booking['reschedule_history'], true ) : array();

		// Add a new entry for the decline reason and time.
		$decline_entry        = array(
			'decline_reason' => $reason,
			'decline_time'   => \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d H:i:s', null, $set_creator_time_zone ), // current_time( 'mysql' ),
		);
		$reschedule_history[] = $decline_entry;

		// Access the WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Update the booking's reschedule history and status to 'declined'.
		$result = $wpdb->update(
			$table_name,
			array(
				'reschedule_history' => json_encode( $reschedule_history ),
				'status'             => 'declined',
			),
			array( 'booking_id' => $booking_id ),
			array( '%s', '%s' ),
			array( '%d' ),
		);

		// Return true if the update was successful, false otherwise.
		return $result !== false;
	}

	/**
	 * Checks if a user exists and is valid based on the provided user ID and role.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $user_id - (Required) The ID of the user.
	 * @param string $role    - (Optional) The role of the user, defaults to 'creator'.
	 * @return bool|WP_Error Returns true if the user exists and is valid, or WP_Error on failure.
	 */
	public static function is_user_exists_and_valid( $user_id, $role = 'creator' ) {
		// The parameters of this function have already been validated. Please ensure proper usage.

		// Declare a global variable to store user existence statuses.
		global $user_existence_status;

		// Sanitize and validate user ID and role.
		$user_id = intval( $user_id );
		$role    = sanitize_text_field( $role );

		// Check if the user's existence status has already been determined and cached.
		if ( ! empty( $user_existence_status[ $user_id ] ) ) {
			return $user_existence_status[ $user_id ]; // Return the cached status.
		}

		// Access the global WordPress database object.
		global $wpdb;

		// Define the table name for the WordPress users table.
		$user_table = $wpdb->users;

		// Check if the user exists in the WordPress users table.
		$wp_user_exists = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT ID FROM $user_table WHERE ID = %d LIMIT 1",
				$user_id,
			),
		);

		// Return WP_Error if the user does not exist in WordPress.
		if ( empty( $wp_user_exists ) ) {
			$user_existence_status[ $user_id ] = new \WP_Error( 'user_not_found', 'User does not exist in WordPress.' );
			return $user_existence_status[ $user_id ];
		}

		// Define the table name prefix based on the user's role.
		if ( $role === FAN ) {
			$prefix = 'fs_users_audience';  // Use the audience table for fans.
		} elseif ( $role === PAETRON ) {
			$prefix = 'fs_users_creators';  // Use the creators table for patrons.
		} else {
			// Define WP_Error for invalid roles.
			$user_existence_status[ $user_id ] = new \WP_Error( 'invalid_role', 'Invalid user role provided.' );

			// Return WP_Error for invalid roles.
			return $user_existence_status[ $user_id ];
		}

		// Define the table name using the WordPress database prefix and role-specific table.
		$table_name = $wpdb->prefix . $prefix;

		// Check if the user exists and is active in the role-specific table.
		$user_exist = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT user_ID FROM $table_name WHERE user_ID = %d AND activity_status = 'active' LIMIT 1",
				$user_id,
			),
		);

		// Set the global status to WP_Error if the user is inactive or not found in the role-specific table.
		if ( empty( $user_exist ) ) {
			$user_existence_status[ $user_id ] = new \WP_Error( 'user_not_active', 'User is either inactive or does not exist in the role-specific table.' );
			return $user_existence_status[ $user_id ];
		}

		// Set the global status to true if the user exists and is active.
		$user_existence_status[ $user_id ] = true;

		// Return true if the user is valid and active.
		return true;
	}

	/**
	 * Validates the booking duration to align with the creator's specified minimum and maximum time limits,
	 * and validates the duration calculated on the frontend.
	 *
	 * @since 1.0
	 * @version 1.0
	 * 
	 * @param int    $creator_id       - (Required) ID of the creator.
	 * @param string $booking_start    - (Required) Start time of the booking.
	 * @param string $booking_end      - (Required) End time of the booking.
	 * @param array  $booking_settings - (Required) Creator's booking settings array.
	 * 
	 * @return bool|\WP_Error True if the booking duration is valid, \WP_Error otherwise.
	 */
	public static function validate_booking_duration( $creator_id, $booking_start, $booking_end, $booking_settings ) {
		// The parameters of this function have already been validated. Please ensure proper usage.

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Debug: Display booking start and end times.
		echo "Booking Start: $booking_start, Booking End: $booking_end<br>";

		// Parse the start and end times into Unix timestamps.
		$booking_start_time = strtotime( $booking_start );
		$booking_end_time   = strtotime( $booking_end );

		// MAIA: update: If booking end time is earlier than start time, it means the booking hours cross midnight.
		if ( $booking_end_time <= $booking_start_time ) {
			$booking_end_time = strtotime( '+1 day', $booking_end_time );
		}

		// Calculate the booking duration in minutes.
		$calculated_duration = ( $booking_end_time - $booking_start_time ) / 60; // Convert seconds to minutes.

		// Debug: Display calculated duration.
		echo "Calculated Duration (minutes): $calculated_duration<br>";

		// Validate that min_booking_time and max_booking_time exist and are greater than 0.
		if ( empty( $booking_settings['min_booking_time'] ) || empty( $booking_settings['max_booking_time'] ) ) {
			return false; // Invalid or missing booking settings.
		}

		// Sanitize min_booking_time and max_booking_time.
		$min_booking_time = intval( $booking_settings['min_booking_time'] );
		$max_booking_time = intval( $booking_settings['max_booking_time'] );

		// Debug: Display min and max booking times.
		echo "Min Booking Time: $min_booking_time, Max Booking Time: $max_booking_time<br>";

		// MAIA fixed it.
		// Validate if the calculated booking duration is zero.
		if ( $calculated_duration === 0 ) {
			// Return wp_error if the booking duration is zero, indicating an invalid duration based on the settings.
			echo "Error: The calculated booking duration is zero minutes, which is not within the allowed range of $min_booking_time to $max_booking_time minutes.<br>";
			return new \WP_Error( 'invalid_booking_duration', 'The booking duration is zero minutes, which does not fall within the allowed minimum and maximum time limits set by the creator.' );
		}

		// Ensure min_booking_time and max_booking_time are greater than 0.
		if ( $min_booking_time <= 0 || $max_booking_time <= 0 ) {
			return false; // Invalid settings for min or max booking time.
		}

		// Validate if the calculated duration falls within the allowed range.
		if ( $calculated_duration < $min_booking_time || $calculated_duration > $max_booking_time ) {
			// Return wp_error if invalid booking duration based on the settings.
			echo "Error: Calculated duration of $calculated_duration minutes does not fall within the allowed range ($min_booking_time - $max_booking_time minutes).<br>";
			return new \WP_Error( 'invalid_booking_duration', 'The booking duration does not fall within the allowed minimum and maximum time limits set by the creator.' );
		}

		// Debug: Confirm valid booking duration.
		echo 'Success: Booking duration is valid.<br>';

		// Booking duration is valid.
		return true;
	}

	/**
	 * Retrieves the creator's booking settings.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $creator_id - (Required) ID of the creator.
	 * @return array|bool The creator's booking settings as an array, or false if not found or invalid.
	 */
	public static function get_creator_booking_settings( $creator_id ) {
		// Return false if creator ID is empty.
		if ( empty( $creator_id ) ) {
			return false;
		}

		// Convert creator ID to an integer.
		$creator_id = intval( $creator_id );

		// Access the global variable containing booking settings.
		global $global_booking_settings;

		// Return global settings if already cached.
		if ( ! empty( $global_booking_settings[ $creator_id ] ) ) {
			return $global_booking_settings[ $creator_id ];
		}

		// Retrieve the creator's booking settings from user fields.
		$user_settings = \MadLinksCoding\Users::get_user_fields( $creator_id, array( 'booking_settings' ) );

		// Return wp_error if the booking settings are not found.
		if ( empty( $user_settings['booking_settings'] ) ) {
			return new \WP_Error( 'booking_setting_not_found', 'Booking settings not found for creator ID: ' . $creator_id );
		}

		// Decode the booking settings from JSON.
		$booking_settings = json_decode( $user_settings['booking_settings'], true );

		// Return false if JSON decoding fails.
		if ( json_last_error() !== JSON_ERROR_NONE ) {
			return false;
		}

		// Cache the settings globally.
		$global_booking_settings[ $creator_id ] = $booking_settings;

		// Return the booking settings.
		return $booking_settings;
	}

	/**
	 * Calculates available time slots between bookings.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int   $creator_id - (Required) ID of the creator.
	 * @param int   $start_time - (Required) Start time for the time slots.
	 * @param int   $end_time   - (Required) End time for the time slots.
	 * @param array $bookings   - (Optional) Array of existing bookings.
	 * @param int   $buffer     - (Optional) Buffer time between bookings (in minutes).
	 * @return array List of available time slots.
	 */
	public static function calculate_time_slots( $creator_id, $start_time, $end_time, $bookings, $buffer ): array|bool {
		// Return false if any of the required parameters are empty.
		if ( empty( $start_time ) || empty( $end_time ) || empty( $buffer ) ) {
			return false;
		}

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Sanitize the start, end times and buffer.
		$start_time = sanitize_text_field( $start_time );
		$end_time   = sanitize_text_field( $end_time );
		$buffer     = intval( $buffer );

		// Ensure bookings is an array.
		if ( ! is_array( $bookings ) ) {
			return false;
		}

		// Initialize the list of available windows.
		$available_windows = array();
		$current_time      = $start_time;

		// Sort bookings by start time.
		usort(
			$bookings,
			function ($a, $b) {
				return $a['start'] <=> $b['start'];
			}
		);

		// Calculate available time slots between bookings.
		foreach ( $bookings as $booking ) {
			$booking_start = $booking['start'] - $buffer * 60;
			$booking_end   = $booking['end'] + $buffer * 60;

			// If the current time is before the booking start, add an available slot.
			if ( $current_time < $booking_start ) {
				$available_windows[] = array(
					'start' => \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d H:i:s', $current_time, $set_creator_time_zone ),
					'end'   => \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d H:i:s', min( $booking_start, $end_time ), $set_creator_time_zone ),
				);
			}

			// Move the current time to the end of the current booking.
			$current_time = max( $current_time, $booking_end );
		}

		// var_dump('$current_time ' . $current_time);
		// var_dump('$end_time ' . $end_time);
		// var_dump('date current_time ' . date( 'Y-m-d H:i:s', $current_time ));
		// var_dump('date end_time ' . date( 'Y-m-d H:i:s', $end_time));

		// If the current time is before the end time, add the final available slot.
		if ( $current_time < $end_time ) {
			// If available, add the current time window to the available windows array.
			$available_windows[] = array(
				'start' => \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d H:i:s', $current_time, $set_creator_time_zone ),
				'end'   => \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d H:i:s', $end_time, $set_creator_time_zone ),
			);
		}

		// Return the array of available windows.
		return $available_windows;
	}

	/**
	 * Retrieves bookings for a creator on a specific date.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $creator_id - (Required) ID of the creator.
	 * @param string $date       - (Required) Date for which to retrieve bookings.
	 * @return array List of bookings for the specified day.
	 */
	public static function get_bookings_for_day( $creator_id, $date ) {
		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Access the WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Prepare and execute the query to retrieve bookings.
		$query = $wpdb->prepare(
			"SELECT booking_start_time AS start, booking_end_time AS end 
			FROM $table_name 
			WHERE creator_id = %d AND booking_date = %s",
			$creator_id,
			$date,
		);

		// Return the list of bookings.
		return $wpdb->get_results( $query, ARRAY_A );
	}

	/**
	 * Extend a booking by rescheduling the subsequent bookings for the creator. This one can be repracted, but keep code as we may use for wait list.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $creator_id    - (Required) ID of the creator.
	 * @param int $booking_id    - (Required) The ID of the current booking to be extended.
	 * @param int $reschedule_by - (Optional) The number of minutes to extend the booking. Default is 30 minutes.
	 * @return bool True if the booking and subsequent bookings were successfully rescheduled, false otherwise.
	 */
	public static function extend_booking_by_reschedule_subsequent_booking( $creator_id, $booking_id, $reschedule_by = 30 ) {
		// Return false if creator_id or booking_id is empty.
		if ( empty( $creator_id ) || empty( $booking_id ) ) {
			return false;
		}

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Sanitize and validate the booking_id and reschedule_by.
		$booking_id    = intval( $booking_id );
		$reschedule_by = intval( $reschedule_by );

		// Retrieve the current booking data using a helper function.
		$booking = self::get_booking_details( $booking_id );

		// Return false if the booking is not found (invalid or missing booking ID).
		if ( empty( $booking ) ) {
			return false;
		}

		// Calculate the new start and end times for the current booking.
		$new_start_time = \MadLinksCoding\Utilities::get_formatted_current_time( 'H:i:s', strtotime( "+$reschedule_by minutes", strtotime( $booking['booking_start_time'] ) ), $set_creator_time_zone );
		$new_end_time   = \MadLinksCoding\Utilities::get_formatted_current_time( 'H:i:s', strtotime( "+$reschedule_by minutes", strtotime( $booking['booking_end_time'] ) ), $set_creator_time_zone );

		// Check if the new time slot is available using availability validation function.
		$is_available = self::check_availability_based_on_json( intval( $booking['creator_id'] ), sanitize_text_field( $booking['booking_date'] ), $new_start_time, $new_end_time );

		// Return false if the new time slot is not available.
		if ( empty( $is_available ) ) {
			return false;
		}

		// Access the WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Update the current booking with the new start, end times, and mark its status as 'rescheduled'.
		$update_result = $wpdb->update(
			$table_name, // The table where bookings are stored.
			array(
				'booking_start_time' => $new_start_time,  // New start time.
				'booking_end_time'   => $new_end_time,    // New end time.
				'status'             => 'rescheduled',    // Set status to 'rescheduled'.
			),
			array( 'booking_id' => $booking_id ),        // Update where booking ID matches.
			array( '%s', '%s', '%s' ),                   // Data types for the updated fields.
			array( '%d' )                                // Data type for the booking_id condition.
		);

		// Return false if the current booking update fails.
		if ( $update_result === false ) {
			return false;
		}

		// Fetch subsequent bookings for the same creator on the same date, starting after the new end time.
		$subsequent_bookings = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM $table_name
				WHERE creator_id = %d AND booking_date = %s 
				AND booking_start_time > %s AND status = 'pending'
				ORDER BY booking_start_time ASC",
				$booking['creator_id'],  // Creator ID.
				$booking['booking_date'], // Booking date.
				$new_end_time            // New end time of the current booking.
			),
			ARRAY_A,
		);

		// Check if there are any subsequent bookings to process.
		if ( empty( $subsequent_bookings ) ) {
			return true; // No subsequent bookings to reschedule, exit early.
		}

		// Iterate through each subsequent booking and attempt to reschedule it.
		foreach ( $subsequent_bookings as $subsequent_booking ) {
			// Calculate the new start and end times for each subsequent booking.
			// $new_subsequent_start = date( 'H:i:s', strtotime( "+$reschedule_by minutes", strtotime( $subsequent_booking['booking_start_time'] ) ) );
			// $new_subsequent_end   = date( 'H:i:s', strtotime( "+$reschedule_by minutes", strtotime( $subsequent_booking['booking_end_time'] ) ) );

			$calculat_new_subsequent_start = strtotime( "+$reschedule_by minutes", strtotime( $subsequent_booking['booking_start_time'] ) );
			$new_subsequent_start          = \MadLinksCoding\Utilities::get_formatted_current_time( 'H:i:s', $calculat_new_subsequent_start, $set_creator_time_zone );

			$calculat_new_subsequent_end = strtotime( "+$reschedule_by minutes", strtotime( $subsequent_booking['booking_end_time'] ) );
			$new_subsequent_end          = \MadLinksCoding\Utilities::get_formatted_current_time( 'H:i:s', $calculat_new_subsequent_end, $set_creator_time_zone );

			// Check availability for the new time slot for the subsequent booking.
			$is_subsequent_available = self::check_availability_based_on_json( $subsequent_booking['creator_id'], $subsequent_booking['booking_date'], $new_subsequent_start, $new_subsequent_end );

			// If the new time slot is unavailable, notify the fan that their booking has been canceled.
			if ( empty( $is_subsequent_available ) ) {
				self::notify_fan_booking_canceled( $subsequent_booking['fan_id'], $subsequent_booking['booking_id'] );
				continue; // Skip this booking and move on to the next one.
			}

			// Define the table name.
			$table_name = $wpdb->prefix . 'fs_bookings';

			// Update each subsequent booking with the new start and end times, and mark as 'rescheduled'.
			$update_subsequent_result = $wpdb->update(
				$table_name, // The table where bookings are stored.
				array(
					'booking_start_time' => $new_subsequent_start,  // New start time.
					'booking_end_time'   => $new_subsequent_end,    // New end time.
					'status'             => 'rescheduled',          // Set status to 'rescheduled'.
				),
				array( 'booking_id' => $subsequent_booking['booking_id'] ), // Update where booking ID matches.
				array( '%s', '%s', '%s' ),                        // Data types for the updated fields.
				array( '%d' )                                     // Data type for the booking_id condition.
			);

			// Check if the update fails for any subsequent booking.
			if ( $update_subsequent_result === false ) {
				return false; // Optionally, you could continue to reschedule other bookings instead of returning.
			}
		}

		// Return true after all bookings (current and subsequent) have been processed.
		return true;
	}

	/**
	 * Notifies relevant parties when a booking is canceled based on specified conditions.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $booking_id - (Required) The ID of the booking being canceled.
	 * @param string $condition  - (Required) The condition triggering the notification.
	 * @return bool True if notifications were successfully sent, false otherwise.
	 */
	public static function notify_booking_status_change( $booking_id, $condition ) {
		// Return false if the booking ID and condition are not provided.
		if ( empty( $booking_id ) || empty( $condition ) ) {
			return false;
		}

		// Sanitize and validate the booking ID.
		$booking_id = intval( $booking_id );
		$condition  = sanitize_text_field( $condition );

		// Check if the notification condition exists; return false if invalid.
		if ( empty( self::$notify_conditions[ $condition ] ) ) {
			return false;
		}

		// Retrieve the notification targets based on the condition.
		$notify_targets = self::$notify_conditions[ $condition ];

		// Send notifications to each target based on the specified condition.
		foreach ( $notify_targets as $target ) {
			// Prepare the notice message.
			$notice = ucfirst( str_replace( '_', ' ', $condition ) ) . ' for Booking ID ' . $booking_id;

			// Retrieve booking details.
			$booking_details = self::get_booking_details( $booking_id );

			// Return false if either fan ID or creator ID in booking details is missing.
			if ( empty( $booking_details['fan_id'] ) || empty( $booking_details['creator_id'] ) ) {
				return false;
			}

			// Retrieve and validate fan and creator IDs from booking details.
			$fan_id     = intval( $booking_details['fan_id'] );
			$creator_id = intval( $booking_details['creator_id'] );

			// Define notification arguments directly.
			$notification_args = array(
				'user_id' => ( $target === 'fan' ) ? $fan_id : $creator_id,
				'notice'  => $notice,
			);

			// Send notifications based on the target.
			switch ( $target ) {
				case 'fan':
					// Notify the fan.
					self::send_notification_email( $booking_details, 'fan', $condition );
					break;

				case 'creator':
					// Notify the creator.
					self::send_notification_email( $booking_details, 'creator', $condition );
					break;

				case 'both':
					// Notify both fan and creator.
					self::send_notification_email( $booking_details, 'fan', $condition );
					self::send_notification_email( $booking_details, 'creator', $condition );
					break;

				default:
					return false; // Handle unexpected targets gracefully.
			}

			// Add notification booking status after sending the email.
			self::add_notification_booking_status( $notification_args );
		}

		// Return true after notifications have been sent.
		return true;
	}

	/**
	 * Sends a notification email to the specified target (fan or creator) regarding booking status.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param array  $booking_details - (Required) Details of the booking.
	 * @param string $target          - (Required) Target of the notification ('fan' or 'creator').
	 * @param string $condition       - (Required) Condition that triggered the notification.
	 */
	private static function send_notification_email( $booking_details, $target, $condition ) {
		// The parameters of this function have already been validated. Please ensure proper usage.

		// Set default email subject.
		$subject = 'Booking Notification';

		// Update subject based on condition if available.
		if ( ! empty( self::$subjects[ $condition ] ) && ! empty( self::$subjects[ $condition ][ $target ] ) ) {
			$subject = self::$subjects[ $condition ][ $target ];
		}

		// Generate the email body content.
		$body = self::get_email_body( $booking_details, $target, $condition );

		// Retrieve and validate fan and creator IDs from booking details.
		$fan_id     = intval( $booking_details['fan_id'] );
		$creator_id = intval( $booking_details['creator_id'] );

		// Retrieve the recipient's email address for fan.
		if ( $target === 'fan' ) {
			$user_info = get_user_by( 'ID', $fan_id );
			$fan_email = $user_info->user_email;
		}

		// Retrieve the recipient's email address for creator.
		if ( $target === 'creator' ) {
			$user_info   = get_user_by( 'ID', $creator_id );
			$model_email = $user_info->user_email;
		}

		// Define the recipient email based on the target.
		$recipient_email = ( $target === 'fan' ) ? $fan_email : $model_email;

		// Set email headers for HTML content.
		$headers = array(
			'Content-Type: text/html; charset=UTF-8',
		);

		// Send the notification email.
		\wp_mail( $recipient_email, $subject, $body, $headers );
	}


	private static function get_email_body( $booking_details, $target, $condition ) {
		// The parameters of this function have already been validated. Please ensure proper usage.

		// Define the email body template.
		$body_template = "
			<h2>Booking Notification</h2>
			<p>Dear {recipient_name},</p>
			<p>Your booking (No: {booking_id}) has been updated based on the following status: {status}.</p>
			<p>Date: {date}</p>
			<p>Time: {time}</p>
			<p>Thank you,</p>
			<p>Fansocial Team</p>
		";

		// Retrieve and sanitize booking details.
		$fan_id             = intval( $booking_details['fan_id'] );
		$creator_id         = intval( $booking_details['creator_id'] );
		$booking_id         = intval( $booking_details['booking_id'] );
		$booking_date       = sanitize_text_field( \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d', $booking_details['booking_date'] ) );
		$booking_start_time = sanitize_text_field( $booking_details['booking_start_time'] );

		// Get the recipient's name of fan.
		if ( $target === 'fan' ) {
			$fan_name = \MadLinksCoding\Users::get_user_display_name( $fan_id );
		}

		// Get the recipient's name of creator.
		if ( $target === 'creator' ) {
			$model_name = \MadLinksCoding\Users::get_user_display_name( $creator_id );
		}

		// Populate template with booking and recipient information.
		$body = str_replace(
			array( '{recipient_name}', '{booking_id}', '{status}', '{date}', '{time}' ),
			array(
				( $target === 'fan' ) ? $fan_name : $model_name,
				$booking_id,
				ucfirst( str_replace( '_', ' ', $condition ) ),
				$booking_date,
				$booking_start_time,
			),
			$body_template,
		);

		// Return the completed email body.
		return $body;
	}

	/**
	 * Adds a booking status notification for a user.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param array $args - An array containing notification details.
	 *
	 * Required - (int)    $args['user_id'] - Provided user ID.
	 * Required - (string) $args['notice']  - The notification message.
	 */
	public static function add_notification_booking_status( $args ) {
		// The parameters of this function have already been validated. Please ensure proper usage.

		// Initialize the fields.
		$user_id  = $args['user_id'];
		$notice   = $args['notice'];
		$type     = 'info';
		$priority = 'high';
		$flag     = 'booking-notification';
		$icon     = 'info';

		// Include the notification class file.
		require_once FANSOCIAL_PLUGIN_DIR_PATH . 'includes/class-account-notifications.php';

		// Prepare arguments for the 'add_notification' function. Escaping and sanitization are handled in 'add_notification'.
		$add_notification_args = array(
			'user_id'  => $user_id,
			'notice'   => $notice,
			'type'     => $type,
			'priority' => $priority,
			'flag'     => $flag,
			'icon'     => $icon,
		);

		// Call the 'add_notification' function to add the notification.
		\MadLinksCoding\Notification::add_notification( $add_notification_args );
	}
	/**
	 * Validate and sanitize the settings array based on predefined data types.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param array $settings_array - An array of booking settings to be validated and sanitized.
	 * @return array An array of validated and sanitized settings.
	 *
	 * Required - (string) 'timezone' - The user's timezone setting.
	 * Optional  - (int)    'min_charge' - Minimum charge for bookings.
	 * Optional  - (array)  'after_hours' - Array of after-hours settings.
	 * Optional  - (array)  'suspensions' - Array of suspension periods.
	 * Optional  - (int)    'booking_buffer' - Buffer time between bookings.
	 * Optional  - (bool)   'advance_booking' - Whether advance booking is enabled.
	 * Optional  - (bool)   'instant_booking' - Whether instant booking is allowed.
	 * Optional  - (int)    'max_booking_time' - Maximum booking time allowed.
	 * Optional  - (int)    'min_booking_time' - Minimum booking time allowed.
	 * Optional  - (bool)   'negotiation_phase' - Whether negotiation phase is enabled.
	 * Optional  - (bool)   'after_hour_surcharge' - Whether an after-hour surcharge applies.
	 * Optional  - (array)  'default_working_hours' - Array of default working hours.
	 * Optional  - (int)    'booking_window_in_minutes' - Booking window in minutes.
	 * Optional  - (int)    'after_hour_token_price_per_minute' - Token price per minute for after-hours.
	 * Optional  - (int)    'default_working_hour_token_price_per_minute' - Token price per minute for working hours.
	 */
	public static function validate_and_sanitize_booking_settings_array( $settings_array ) {
		// Initialize an empty array for validated and sanitized settings.
		$validated_settings = array();

		// Define the expected keys and their respective data types for validation and sanitization.
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

		// Loop through each provided key in the input array.
		foreach ( $settings_array as $key => $value ) {
			// Check if the provided key is an expected key.
			if ( array_key_exists( $key, $expected_keys ) ) {
				// Determine the expected type and sanitize accordingly.
				switch ( $expected_keys[ $key ] ) {
					case 'int':
						// Sanitize and cast the value as an integer.
						$validated_settings[ $key ] = intval( $value );
						break;
					case 'bool':
						// Sanitize and convert the value to a boolean.
						$validated_settings[ $key ] = filter_var( $value, FILTER_VALIDATE_BOOLEAN );
						break;
					case 'string':
						// Sanitize the value as a string.
						$validated_settings[ $key ] = sanitize_text_field( $value );
						break;
					case 'array':
						// Ensure the value is an array, or default to an empty array.
						$validated_settings[ $key ] = is_array( $value ) ? $value : array();
						break;
				}
			}
		}

		// Return the array of validated and sanitized settings.
		return $validated_settings;
	}

	/**
	 * Retrieves the creator's or fan's bookings.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $user_id - (Required) Provided user ID.
	 * @return array An array of bookings or an empty array if no bookings are found.
	 */
	public static function get_creators_bookings( $user_id ) {
		// Return an empty array if user_id is empty.
		if ( empty( $user_id ) ) {
			return array();
		}

		// Sanitize and validate the user ID.
		$user_id = intval( $user_id );

		// Retrieve the user's role based on the sanitized user ID.
		$role = \MadLinksCoding\Users::get_user_role( $user_id );

		// Define the column name based on the user's role.
		if ( $role === FAN ) {
			$column_name = 'fan_id';
		} elseif ( $role === PAETRON ) {
			$column_name = 'creator_id';
		} else {
			return false; // Return false if the role is invalid.
		}

		// Access the global WordPress database object.
		global $wpdb;

		// Define the table name.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Prepare the SQL query to retrieve bookings for the user.
		$query = $wpdb->prepare(
			"SELECT * FROM $table_name
			WHERE $column_name = %d 
			ORDER BY booking_date DESC, booking_start_time ASC",
			$user_id,
		);

		// Execute the query and retrieve the results as an associative array.
		$bookings = $wpdb->get_results( $query, ARRAY_A );

		// Return an empty array if no bookings are found.
		if ( empty( $bookings ) ) {
			return array();
		}

		// Return the list of bookings.
		return $bookings;
	}

	/**
	 * Determines if an appointment crosses over between working hours and after-hours.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $creator_id        - (Required) The ID of the creator.
	 * @param string $appointment_start - (Required) The start time of the appointment.
	 * @param string $appointment_end   - (Required) The end time of the appointment.
	 * @param string $date              - (Required) The date of the appointment.
	 * @param array  $booking_settings  - (Required) Array containing working hours and after-hours settings.
	 * @return array Returns an array with cross-over status and minutes in working and after-hours.
	 */
	public static function does_appointment_cross_over( $creator_id, $appointment_start, $appointment_end, $date, $booking_settings ) {
		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Retrieve working hours from booking settings.
		$working_hours = $booking_settings['default_working_hours'];

		// Retrieve after-hours from booking settings.
		$after_hours = $booking_settings['after_hours'];

		// Convert appointment start time to a timestamp.
		$appointment_start_timestamp = strtotime( $date . ' ' . $appointment_start );

		// Convert appointment end time to a timestamp.
		$appointment_end_timestamp = strtotime( $date . ' ' . $appointment_end );

		// Convert working hours start time to a timestamp.
		$working_start_timestamp = strtotime( $date . ' ' . $working_hours['start'] );

		// Convert working hours end time to a timestamp.
		$working_end_timestamp = strtotime( $date . ' ' . $working_hours['end'] );

		// Convert after-hours start time to a timestamp.
		$after_hours_start_timestamp = strtotime( $date . ' ' . $after_hours['start'] );

		// Convert after-hours end time to a timestamp.
		$after_hours_end_timestamp = strtotime( $date . ' ' . $after_hours['end'] );

		// Initialize minutes spent in working hours to 0.
		$minutes_in_default = 0;

		// Initialize minutes spent in after-hours to 0.
		$minutes_in_after_hours = 0;

		// Check if the appointment falls within offline hours.
		$is_within_offline = self::is_booking_within_offline_hours( $creator_id, $appointment_start, $appointment_end, $date, $booking_settings );

		// Return if offline hours produce an error.
		if ( is_wp_error( $is_within_offline ) ) {
			return array(
				'cross_over'             => false,
				'minutes_in_default'     => $minutes_in_default,
				'minutes_in_after_hours' => $minutes_in_after_hours,
			);
		}

		// Adjust working hours if the end time is before the start time (crosses midnight).
		if ( $working_end_timestamp < $working_start_timestamp ) {
			$working_end_timestamp = strtotime( '+1 day', $working_end_timestamp );
		}

		// Adjust after-hours if the end time is before the start time (crosses midnight).
		if ( $after_hours_end_timestamp < $after_hours_start_timestamp ) {
			$after_hours_end_timestamp = strtotime( '+1 day', $after_hours_end_timestamp );
		}

		// Adjust appointment end time if it is before the start time (crosses midnight).
		if ( $appointment_end_timestamp < $appointment_start_timestamp ) {
			$appointment_end_timestamp = strtotime( '+1 day', $appointment_end_timestamp );
		}

		// Check if the entire appointment is within working hours.
		if ( $appointment_start_timestamp >= $working_start_timestamp && $appointment_end_timestamp <= $working_end_timestamp ) {
			// Calculate minutes spent in working hours.
			$minutes_in_default = ( $appointment_end_timestamp - $appointment_start_timestamp ) / 60;
			// Check if the entire appointment is within after-hours.
		} elseif ( $appointment_start_timestamp >= $after_hours_start_timestamp && $appointment_end_timestamp <= $after_hours_end_timestamp ) {
			// Calculate minutes spent in after-hours.
			$minutes_in_after_hours = ( $appointment_end_timestamp - $appointment_start_timestamp ) / 60;
			// Handle appointments that cross over between working and after-hours.
		} elseif ( $appointment_start_timestamp < $working_end_timestamp && $appointment_end_timestamp > $after_hours_start_timestamp ) {

			// Adjust the appointment times if the end time is before the start time.
			if ( $appointment_start_timestamp < $working_end_timestamp && $appointment_end_timestamp < $working_end_timestamp ) {
				$appointment_start_timestamp = strtotime( '+1 day', $appointment_start_timestamp );
				$appointment_end_timestamp   = strtotime( '+1 day', $appointment_end_timestamp );
			}

			// Calculate minutes spent in working hours.
			$minutes_in_default = ( $working_end_timestamp - $appointment_start_timestamp ) / 60;

			// Calculate minutes spent in after-hours.
			$minutes_in_after_hours = ( $appointment_end_timestamp - $working_end_timestamp ) / 60;
			// Handle cases where the appointment does not fit within normal working or after-hours.
		} else {
			// Check if the appointment start is between the end of working hours and the start of after-hours.
			if ( $appointment_start > $working_hours['end'] && $appointment_start < $after_hours['start'] ) {
				// Set minutes for both working and after-hours to zero.
				$minutes_in_default     = 0;
				$minutes_in_after_hours = 0;
			} else {
				// Check if the appointment starts before working hours.
				if ( $appointment_start < $working_hours['start'] && $appointment_start < $working_hours['end'] ) {
					// Set the next appointment date to the following day.
					$next_appointment_date = \MadLinksCoding\Utilities::get_formatted_current_time( 'Y-m-d', strtotime( $date . ' +1 day' ), $set_creator_time_zone );
				} else {
					// Keep the appointment date as the same day.
					$next_appointment_date = $date;
				}

				// Convert appointment start time for the next day (if applicable).
				$appointment_start_timestamp = strtotime( $next_appointment_date . ' ' . $appointment_start );

				// Convert appointment end time for the next day (if applicable).
				$appointment_end_timestamp = strtotime( $next_appointment_date . ' ' . $appointment_end );

				// Check if the appointment crosses over to the next day.
				if ( $date !== $next_appointment_date ) {
					// Set minutes in working hours to zero.
					$minutes_in_default = 0;

					// Calculate minutes in after-hours.
					$minutes_in_after_hours = ( $appointment_end_timestamp - $appointment_start_timestamp ) / 60;
				} else {
					// Calculate minutes spent in working hours.
					$minutes_in_default = ( $working_end_timestamp - $appointment_start_timestamp ) / 60;

					// Calculate minutes spent in after-hours.
					$minutes_in_after_hours = ( $appointment_end_timestamp - $working_end_timestamp ) / 60;
				}
			}
		}

		// Return final calculated minutes within working and after-hours.
		return array(
			'cross_over'             => ( $minutes_in_default > 0 && $minutes_in_after_hours > 0 ),
			'minutes_in_default'     => $minutes_in_default,
			'minutes_in_after_hours' => $minutes_in_after_hours,
		);
	}

	/**
	 * Calculates the total price for an appointment based on minutes within working and after-hours.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $creator_id                 - (Required) The ID of the creator.
	 * @param string $appointment_start          - (Required) The start time of the appointment.
	 * @param string $appointment_end            - (Required) The end time of the appointment.
	 * @param string $date                       - (Required) The date of the appointment.
	 * @param int    $default_token_per_minute   - (Required) The token rate per minute during working hours.
	 * @param int    $surcharge_token_per_minute - (Required) The surcharge rate per minute during after-hours.
	 * @param array  $booking_settings           - (Required) Array containing working hours and after-hours settings.
	 * @return array Returns an array with pricing details including total, regular, and after-hours minutes and costs.
	 */
	public static function calculate_price( $creator_id, $appointment_start, $appointment_end, $date, $default_token_per_minute, $surcharge_token_per_minute, $booking_settings ) {
		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Get the cross-over data.
		$crossover_data = self::does_appointment_cross_over( $creator_id, $appointment_start, $appointment_end, $date, $booking_settings );

		// Calculate minutes in regular and after-hours.
		$regular_minutes     = $crossover_data['minutes_in_default'];
		$after_hours_minutes = $crossover_data['minutes_in_after_hours'];

		// Calculate prices based on regular and surcharge rates.
		$regular_price   = $regular_minutes * $default_token_per_minute;
		$surcharge_price = $after_hours_minutes * $surcharge_token_per_minute;
		$total_price     = $regular_price + $surcharge_price;

		// Return the pricing details.
		return array(
			'total_price'         => $total_price,
			'regular_minutes'     => $regular_minutes,
			'after_hours_minutes' => $after_hours_minutes,
			'regular_price'       => $regular_price,
			'surcharge_price'     => $surcharge_price,
		);
	}

	/**
	 * Retrieves offline hours based on working and after-hours settings.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param array $booking_settings - (Required) Array containing working and after-hours settings.
	 * @return array Returns an array of offline periods with start and end times.
	 */
	public static function get_offline_hours( $booking_settings ) {

		// Get the start and end times for default working hours and after-hours.
		$working_hours_end   = $booking_settings['default_working_hours']['end'];
		$working_hours_start = $booking_settings['default_working_hours']['start'];
		$after_hours_start   = $booking_settings['after_hours']['start'];
		$after_hours_end     = $booking_settings['after_hours']['end'];

		// Create an array to store offline periods.
		$offline_hours = array();

		// Define offline period 1: Between the end of working hours and start of after-hours.
		$offline_hours[] = array(
			'offline_start' => $working_hours_end,
			'offline_end'   => $after_hours_start,
		);

		// Define offline period 2: After the end of after-hours and before the next working hours start.
		$offline_hours[] = array(
			'offline_start' => $after_hours_end,
			'offline_end'   => $working_hours_start,
		);

		// Return the offline periods.
		return $offline_hours;
	}

	/**
	 * Checks if a booking falls within offline hours based on the provided booking settings.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $creator_id         - (Required) The ID of the creator.
	 * @param string $booking_start_time - (Required) The start time of the booking.
	 * @param string $booking_end_time   - (Required) The end time of the booking.
	 * @param string $date               - (Required) The date of the booking.
	 * @param array  $booking_settings   - (Required) Array containing working hours and after-hours settings.
	 * @return bool|WP_Error Returns true if booking is valid, or WP_Error if it falls within offline hours.
	 */
	public static function is_booking_within_offline_hours( $creator_id, $booking_start_time, $booking_end_time, $date, $booking_settings ) {
		// The parameters of this function have already been validated. Please ensure proper usage.

		// Set the time zone for the creator and store the result.
		$set_creator_time_zone = \MadLinksCoding\Utilities::set_creator_time_zone( $creator_id );

		// Return false if the creator's time zone could not be set.
		if ( empty( $set_creator_time_zone ) ) {
			return false;
		}

		// Get the offline hours based on booking settings.
		$offline_hours = self::get_offline_hours( $booking_settings );

		// Convert booking start and end times to timestamps.
		$booking_start_timestamp = strtotime( $date . ' ' . $booking_start_time );
		$booking_end_timestamp   = strtotime( $date . ' ' . $booking_end_time );

		// Iterate through each offline period to check if booking falls within offline hours.
		foreach ( $offline_hours as $period ) {
			$offline_start_timestamp = strtotime( $date . ' ' . $period['offline_start'] );
			$offline_end_timestamp   = strtotime( $date . ' ' . $period['offline_end'] );

			// Adjust for the day change if offline end is earlier than offline start (crosses midnight).
			if ( $offline_end_timestamp < $offline_start_timestamp ) {
				$offline_end_timestamp = strtotime( '+1 day', $offline_end_timestamp );
			}

			// Check if booking start or end falls within this offline period.
			$is_start_within_offline = ( $booking_start_timestamp > $offline_start_timestamp && $booking_start_timestamp < $offline_end_timestamp );
			$is_end_within_offline   = ( $booking_end_timestamp > $offline_start_timestamp && $booking_end_timestamp < $offline_end_timestamp );

			// Return error if either start or end falls within offline hours.
			if ( $is_start_within_offline || $is_end_within_offline ) {
				return new \WP_Error( 'booking_within_offline_hours', 'The booking falls within offline hours.' );
			}
		}

		// Return true if booking does not fall within offline hours.
		return true; // Indicating that the booking is valid.
	}

	/**
	 * Checks if the creator has enabled booking in advance.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $creator_id - (Required) The creator's user ID.
	 * @return bool True if advance booking is enabled, false otherwise.
	 */
	public static function has_model_enabled_booking( $creator_id ) {
		// Get the creator's booking settings.
		$settings = self::get_creator_booking_settings( $creator_id );

		// Return false if settings retrieval failed.
		if ( is_wp_error( $settings ) || empty( $settings ) ) {
			return false;
		}

		// Return whether advance booking is enabled.
		return ! empty( $settings['advance_booking'] );
	}

	/**
	 * Checks if the creator has enabled the negotiation phase for bookings.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $creator_id - (Required) The creator's user ID.
	 * @return bool True if negotiation phase is enabled, false otherwise.
	 */
	public static function has_model_enabled_negotiation( $creator_id ) {
		// Get the creator's booking settings.
		$settings = self::get_creator_booking_settings( $creator_id );

		// Return false if settings retrieval failed.
		if ( is_wp_error( $settings ) || empty( $settings ) ) {
			return false;
		}

		// Return whether negotiation phase is enabled.
		return ! empty( $settings['negotiation_phase'] );
	}

	/**
	 * Retrieves the booking buffer time for the creator.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $creator_id - (Required) The creator's user ID.
	 * @return int|bool The booking buffer time in minutes, or false if not set.
	 */
	public static function get_booking_buffer_time( $creator_id ) {
		// Get the creator's booking settings.
		$settings = self::get_creator_booking_settings( $creator_id );

		// Return false if settings retrieval failed.
		if ( is_wp_error( $settings ) || empty( $settings ) ) {
			return false;
		}

		// Return the booking buffer time if set, otherwise false.
		return ! empty( $settings['booking_buffer'] ) ? intval( $settings['booking_buffer'] ) : false;
	}

	/**
	 * Retrieves the minimum booking time for the creator.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $creator_id - (Required) The creator's user ID.
	 * @return int|bool The minimum booking time in minutes, or false if not set.
	 */
	public static function get_minimum_booking_time( $creator_id ) {
		// Get the creator's booking settings.
		$settings = self::get_creator_booking_settings( $creator_id );

		// Return false if settings retrieval failed.
		if ( is_wp_error( $settings ) || empty( $settings ) ) {
			return false;
		}

		// Return the minimum booking time if set, otherwise false.
		return ! empty( $settings['min_booking_time'] ) ? intval( $settings['min_booking_time'] ) : false;
	}

	/**
	 * Retrieves the maximum booking time for the creator.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $creator_id - (Required) The creator's user ID.
	 * @return int|bool The maximum booking time in minutes, or false if not set.
	 */
	public static function get_maximum_booking_time( $creator_id ) {
		// Get the creator's booking settings.
		$settings = self::get_creator_booking_settings( $creator_id );

		// Return false if settings retrieval failed.
		if ( is_wp_error( $settings ) || empty( $settings ) ) {
			return false;
		}

		// Return the maximum booking time if set, otherwise false.
		return ! empty( $settings['max_booking_time'] ) ? intval( $settings['max_booking_time'] ) : false;
	}

	/**
	 * Retrieves the user ID associated with a booking based on role.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $booking_id (Required) The ID of the booking.
	 * @param string $role       (Required) The role of the user, either 'fan' or 'creator'.
	 * @return int|bool The user ID if found, false otherwise.
	 */
	public static function get_user_id_from_booking( $booking_id, $role ) {
		// Declare a global variable to store user existence statuses.
		global $user_id_from_booking;

		// Sanitize and validate user ID.
		$booking_id = intval( $booking_id );

		// Check if the user's existence status has already been determined and cached.
		if ( ! empty( $user_id_from_booking[ $booking_id ] ) ) {
			return $user_id_from_booking[ $booking_id ]; // Return the cached status.
		}

		// Access the global WordPress database object.
		global $wpdb;

		// Define the table name with the WordPress prefix.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Determine the column to retrieve based on the role.
		$column = ( $role === 'fan' ) ? 'fan_id' : 'creator_id';

		// Prepare and execute the query to get the user ID.
		$user_id = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT $column FROM $table_name WHERE booking_id = %d LIMIT 1",
				$booking_id
			)
		);

		// Set the global status to true if the user exists and is active.
		$user_id_from_booking[ $booking_id ] = $user_id;

		// Return the user ID or false if not found.
		return ! empty( $user_id_from_booking[ $booking_id ] ) ? intval( $user_id_from_booking[ $booking_id ] ) : false;
	}

	/**
	 * Handles the creation of a booking with specified details.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $fan_id               - (Required) ID of the fan creating the booking.
	 * @param int    $creator_id           - (Required) ID of the creator being booked.
	 * @param string $booking_date         - (Required) Date of the booking.
	 * @param string $booking_start        - (Required) Start time of the booking.
	 * @param string $booking_end          - (Required) End time of the booking.
	 * @param float  $base_charge          - (Required) Base charge for the booking.
	 * @param bool   $negotiation_phase    - (Optional) Whether the booking is in a negotiation phase.
	 * @param array  $initial_token_charge - (Optional) Initial token charges applied to the booking.
	 *
	 * @return bool|\WP_Error True if booking is successfully created, WP_Error otherwise.
	 */
	public static function handle_create_booking( $fan_id, $creator_id, $booking_date, $booking_start, $booking_end, $base_charge, $negotiation_phase = false, $initial_token_charge = array() ) {
		// Return error if required fields are empty.
		if ( empty( $fan_id ) || empty( $creator_id ) || empty( $booking_date ) || empty( $booking_start ) || empty( $booking_end ) ) {
			return new \WP_Error( 'missing_required_fields', 'One or more required fields are missing.' );
		}

		// Sanitize and validate fields.
		$fan_id               = intval( $fan_id ); // Ensure fan ID is an integer.
		$creator_id           = intval( $creator_id ); // Ensure creator ID is an integer.
		$booking_date         = sanitize_text_field( $booking_date ); // Sanitize booking date.
		$booking_start        = sanitize_text_field( $booking_start ); // Sanitize start time.
		$booking_end          = sanitize_text_field( $booking_end ); // Sanitize end time.
		$base_charge          = floatval( $base_charge ); // Ensure base charge is a float.
		$negotiation_phase    = ! empty( $negotiation_phase ) ? boolval( $negotiation_phase ) : false; // Set negotiation phase as boolean.
		$initial_token_charge = ! empty( $initial_token_charge ) ? array_map( 'sanitize_text_field', $initial_token_charge ) : array(); // Sanitize initial token charges array.

		// Attempt to create the booking.
		$is_booking_created = self::create_booking(
			fan_id               : $fan_id,
			creator_id           : $creator_id,
			booking_date         : $booking_date,
			booking_start        : $booking_start,
			booking_end          : $booking_end,
			base_charge          : $base_charge,
			negotiation_phase    : $negotiation_phase,
			initial_token_charge : $initial_token_charge
		);

		// Return error if booking creation failed.
		if ( is_wp_error( $is_booking_created ) || empty( $is_booking_created ) ) {
			return $is_booking_created;
		}

		// Return true if booking was successfully created.
		return true;
	}

	/**
	 * Handles the ready state for a booking.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int    $booking_id   - (Required) The ID of the booking to check the ready state.
	 * @param string $user_type - (Required) The user type ('fan', 'creator', or 'both') indicating who is marking ready state.
	 * @return bool True if a missed booking is registered, false otherwise.
	 */
	public static function handle_no_show( $booking_id, $user_type ) {
		// Return false if booking ID is empty.
		if ( empty( $booking_id ) || ! in_array( $user_type, array( 'fan', 'creator', 'both' ) ) ) {
			return false;
		}

		// Convert booking ID and user_type.
		$booking_id = intval( $booking_id );
		$user_type  = sanitize_text_field( $user_type );

		// Access the global WordPress database object.
		global $wpdb;

		// Define the table name for bookings.
		$table_name = $wpdb->prefix . 'fs_bookings';

		// Retrieve booking details for the provided booking ID.
		$booking = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT creator_id, fan_id, booking_start_time, ready_state_time, ready_by 
				FROM $table_name 
				WHERE booking_id = %d",
				$booking_id
			),
			ARRAY_A
		);

		// Return false if no booking record is found.
		if ( empty( $booking ) ) {
			return false;
		}

		// Define creator ID and convert times to UNIX timestamps.
		$creator_id         = intval( $booking['creator_id'] );
		$booking_start_time = strtotime( $booking['booking_start_time'] );
		$ready_state_time   = ! empty( $booking['ready_state_time'] ) ? strtotime( $booking['ready_state_time'] ) : null;
		$ready_by           = sanitize_text_field( $booking['ready_by'] );

		$calculate_missed_booking_time = $ready_state_time > $booking_start_time - 300;

		// Check if the booking is marked as ready in time.
		if ( ! empty( $ready_state_time ) || $calculate_missed_booking_time ) {
			if ( $ready_by === 'creator' || $ready_by === 'both' ) {
				// Register a missed booking if the creator was not ready on time.
				$register_missed_booking = self::register_missed_booking( $booking_id, 'creator' );
			} elseif ( $ready_by === 'fan' || $ready_by === 'both' ) {
				// Register a missed booking if the creator was not ready on time.
				$register_missed_booking = self::register_missed_booking( $booking_id, 'fan' );
			}

			// Return the result of the missed booking registration.
			return $register_missed_booking;
		}

		// Return false if no missed booking was registered.
		return false;
	}

	/**
	 * Handles the no-show status for a creator.
	 *
	 * @since 1.0
	 * @version 1.0
	 * @author Nway Nway Oo
	 *
	 * @param int $creator_id (Required) The ID of the creator to check for no-show status.
	 * @return bool True if a suspension is applied, false otherwise.
	 */
	public static function handle_creator_suspesnion( $creator_id ) {
		// Return false if the creator ID is empty.
		if ( empty( $creator_id ) ) {
			return false;
		}

		// Sanitize the creator ID to ensure it is an integer.
		$creator_id = absint( $creator_id );

		// Retrieve the creator's no_show_count from user fields.
		$user_settings = \MadLinksCoding\Users::get_user_fields( $creator_id, array( 'no_show_count' ) );

		// Check if no-show count is 3 or more.
		if ( $user_settings['no_show_count'] >= 3 ) {
			// Apply a one-month suspension to creator.
			return self::apply_missed_booking_suspension( $creator_id );
		}

		// Return false if no suspension is applied.
		return false;
	}
}

new \MadLinksCoding\Bookings();

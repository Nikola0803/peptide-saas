<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Hooks whichever popular form plugin is active and forwards each
 * submission to the Command Center as a new support conversation. Safe to
 * have both hooks registered even if only one plugin is installed — the
 * other simply never fires.
 */
class CC_Forms {

	public static function init() {
		add_action( 'wpcf7_mail_sent', array( __CLASS__, 'handle_cf7' ) );
		add_action( 'wpforms_process_complete', array( __CLASS__, 'handle_wpforms' ), 10, 4 );
	}

	/**
	 * Contact Form 7 — field names vary per form, so this takes a
	 * best-effort guess at which fields are name/email/phone/message
	 * based on common naming conventions, rather than requiring the site
	 * owner to configure field mappings.
	 */
	public static function handle_cf7( $contact_form ) {
		$submission = WPCF7_Submission::get_instance();
		if ( ! $submission ) {
			return;
		}

		$data = $submission->get_posted_data();
		$fields = self::guess_fields( $data );

		self::forward(
			$fields['name'],
			$fields['email'],
			$fields['phone'],
			$contact_form->title(),
			$fields['message'] ?: self::flatten( $data )
		);
	}

	public static function handle_wpforms( $fields, $entry, $form_data, $entry_id ) {
		$flat = array();
		foreach ( $fields as $field ) {
			$flat[ strtolower( isset( $field['name'] ) ? $field['name'] : '' ) ] = isset( $field['value'] ) ? $field['value'] : '';
		}

		$guessed = self::guess_fields( $flat );

		self::forward(
			$guessed['name'],
			$guessed['email'],
			$guessed['phone'],
			isset( $form_data['settings']['form_title'] ) ? $form_data['settings']['form_title'] : '',
			$guessed['message'] ?: self::flatten( $flat )
		);
	}

	private static function guess_fields( $data ) {
		$name = $email = $phone = $message = '';

		foreach ( $data as $key => $value ) {
			if ( is_array( $value ) ) {
				continue;
			}
			$key_l = strtolower( $key );

			if ( ! $email && ( strpos( $key_l, 'email' ) !== false || strpos( $key_l, 'mail' ) !== false ) ) {
				$email = $value;
			} elseif ( ! $name && ( strpos( $key_l, 'name' ) !== false ) ) {
				$name = $value;
			} elseif ( ! $phone && ( strpos( $key_l, 'phone' ) !== false || strpos( $key_l, 'tel' ) !== false ) ) {
				$phone = $value;
			} elseif ( ! $message && ( strpos( $key_l, 'message' ) !== false || strpos( $key_l, 'comment' ) !== false || strpos( $key_l, 'body' ) !== false ) ) {
				$message = $value;
			}
		}

		return compact( 'name', 'email', 'phone', 'message' );
	}

	private static function flatten( $data ) {
		$lines = array();
		foreach ( $data as $key => $value ) {
			if ( is_array( $value ) ) {
				$value = implode( ', ', $value );
			}
			$lines[] = $key . ': ' . $value;
		}
		return implode( "\n", $lines );
	}

	private static function forward( $name, $email, $phone, $subject, $message ) {
		$settings = get_option( 'cc_connector_settings' );
		if ( empty( $settings['tracking_public_key'] ) || empty( $settings['forms_submit_url'] ) ) {
			return; // Not connected, or connected before this feature existed — reconnect to pick up the new keys.
		}

		wp_remote_post(
			$settings['forms_submit_url'],
			array(
				'timeout' => 10,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'publicKey' => $settings['tracking_public_key'],
						'name'      => $name,
						'email'     => $email,
						'phone'     => $phone,
						'subject'   => $subject,
						'message'   => $message,
					)
				),
			)
		);
	}
}

CC_Forms::init();

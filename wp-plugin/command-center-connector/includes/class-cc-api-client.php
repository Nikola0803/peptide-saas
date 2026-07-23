<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * All HTTP calls out to the Command Center live here, so the rest of the
 * plugin never touches wp_remote_* directly.
 */
class CC_API_Client {

	/**
	 * POST {command_center_url}/api/plugin/register
	 *
	 * This is the "automatic recognition of new websites" handshake: the
	 * organization API key is org-wide (found on the Command Center's
	 * Settings page), and this site's URL is enough for the backend to
	 * create a brand new Brand row on first contact — no one has to add
	 * this store manually in the dashboard first.
	 *
	 * @return array|WP_Error Decoded JSON on success.
	 */
	public static function register( $command_center_url, $api_key ) {
		$response = wp_remote_post(
			trailingslashit( $command_center_url ) . 'api/plugin/register',
			array(
				'timeout' => 20,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'apiKey'   => $api_key,
						'siteUrl'  => home_url(),
						'siteName' => get_bloginfo( 'name' ),
					)
				),
			)
		);

		return self::handle_response( $response );
	}

	/**
	 * POST {command_center_url}/api/plugin/bulk-sync?store={brand_id}
	 * Used both for the initial "pull everything in" backfill and for the
	 * scheduled reconciliation sync.
	 */
	public static function bulk_sync( $command_center_url, $brand_id, $webhook_secret, $products, $orders ) {
		$url = trailingslashit( $command_center_url ) . 'api/plugin/bulk-sync?store=' . rawurlencode( $brand_id );

		$response = wp_remote_post(
			$url,
			array(
				'timeout' => 60,
				'headers' => array(
					'Content-Type' => 'application/json',
					'X-CC-Secret'  => $webhook_secret,
				),
				'body'    => wp_json_encode(
					array(
						'products' => $products,
						'orders'   => $orders,
					)
				),
			)
		);

		return self::handle_response( $response );
	}

	private static function handle_response( $response ) {
		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code < 200 || $code >= 300 ) {
			$message = isset( $body['error'] ) ? $body['error'] : 'Unexpected response (HTTP ' . $code . ')';
			return new WP_Error( 'cc_connector_http_error', $message, array( 'status' => $code ) );
		}

		return $body;
	}
}

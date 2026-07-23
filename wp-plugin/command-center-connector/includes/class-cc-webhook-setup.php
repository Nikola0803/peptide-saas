<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Creates (or repairs) the native WooCommerce webhooks that push order
 * events to the Command Center. Using WooCommerce's own webhook system —
 * rather than a custom hook straight out of this plugin — means the
 * delivery, retry, and signing behavior the Command Center's ingestion
 * endpoint already expects (X-WC-Webhook-Signature) matches exactly what a
 * site owner would get setting this up by hand.
 */
class CC_Webhook_Setup {

	const TOPICS = array(
		'order.created' => 'Command Center — Order Created',
		'order.updated' => 'Command Center — Order Updated',
	);

	/**
	 * @param string $delivery_url Full ingestion URL, e.g. https://.../api/webhooks/woocommerce?store=abc123
	 * @param string $secret       Per-brand secret returned from /api/plugin/register.
	 */
	public static function ensure_webhooks( $delivery_url, $secret ) {
		if ( ! class_exists( 'WC_Webhook' ) ) {
			return new WP_Error( 'cc_connector_no_wc_webhook', 'WooCommerce webhook support unavailable.' );
		}

		foreach ( self::TOPICS as $topic => $name ) {
			$existing = self::find_existing_webhook( $delivery_url, $topic );
			$webhook  = $existing ? $existing : new WC_Webhook();

			$webhook->set_name( $name );
			$webhook->set_topic( $topic );
			$webhook->set_delivery_url( $delivery_url );
			$webhook->set_secret( $secret );
			$webhook->set_status( 'active' );
			$webhook->set_api_version( 3 );
			$webhook->save();
		}

		return true;
	}

	/**
	 * Avoid creating duplicate webhooks if "Connect" is clicked more than
	 * once (e.g. after rotating the org API key).
	 */
	private static function find_existing_webhook( $delivery_url, $topic ) {
		$data_store = WC_Data_Store::load( 'webhook' );
		$ids        = $data_store->search_webhooks( array( 'limit' => -1 ) );

		foreach ( $ids as $id ) {
			$webhook = new WC_Webhook( $id );
			if ( $webhook->get_delivery_url() === $delivery_url && $webhook->get_topic() === $topic ) {
				return $webhook;
			}
		}

		return null;
	}
}

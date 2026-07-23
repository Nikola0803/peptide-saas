<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class CC_Sync {

	/**
	 * Runs the full backfill/reconciliation sync using whatever connection
	 * details are currently stored in options. Called both by the "Sync
	 * all products & orders now" button and the twice-daily cron job.
	 */
	public static function run_scheduled_sync() {
		$settings = get_option( 'cc_connector_settings' );
		if ( empty( $settings['brand_id'] ) || empty( $settings['webhook_secret'] ) ) {
			return; // Not connected yet — nothing to do.
		}

		self::sync_now( $settings );
	}

	/**
	 * @param array $settings cc_connector_settings option value.
	 * @return array|WP_Error Result from the bulk-sync API call.
	 */
	public static function sync_now( $settings ) {
		$products = self::collect_products();
		$orders   = self::collect_recent_orders();

		$result = CC_API_Client::bulk_sync(
			$settings['command_center_url'],
			$settings['brand_id'],
			$settings['webhook_secret'],
			$products,
			$orders
		);

		if ( ! is_wp_error( $result ) ) {
			$settings['last_synced_at'] = current_time( 'mysql' );
			update_option( 'cc_connector_settings', $settings );
		}

		return $result;
	}

	/**
	 * Every product, in the shape the bulk-sync endpoint expects. Simple
	 * products only for the skeleton — variable-product variations would
	 * need a follow-up pass, one row per variation with its own SKU.
	 */
	private static function collect_products() {
		$products = array();
		$page     = 1;

		do {
			$batch = wc_get_products(
				array(
					'status' => 'publish',
					'limit'  => 100,
					'page'   => $page,
				)
			);

			foreach ( $batch as $product ) {
				if ( ! $product->get_sku() ) {
					continue; // Products without a SKU can't map to a master catalog row.
				}
				$products[] = array(
					'id'             => $product->get_id(),
					'sku'            => $product->get_sku(),
					'name'           => $product->get_name(),
					'price'          => $product->get_price(),
					'stock_quantity' => $product->get_stock_quantity(),
				);
			}

			$page++;
		} while ( count( $batch ) === 100 );

		return $products;
	}

	/**
	 * Recent orders (default: last 12 months) formatted like the payload
	 * the live order.created webhook sends, so both paths share the same
	 * processing logic on the Command Center side.
	 */
	private static function collect_recent_orders() {
		$orders_out = array();

		$orders = wc_get_orders(
			array(
				'limit'        => 500,
				'orderby'      => 'date',
				'order'        => 'DESC',
				'date_created' => '>' . ( time() - YEAR_IN_SECONDS ),
			)
		);

		foreach ( $orders as $order ) {
			$line_items = array();
			foreach ( $order->get_items() as $item ) {
				$product = $item->get_product();
				$line_items[] = array(
					'sku'      => $product ? $product->get_sku() : '',
					'name'     => $item->get_name(),
					'quantity' => $item->get_quantity(),
					'total'    => $item->get_total(),
				);
			}

			$coupon_lines = array();
			foreach ( $order->get_coupon_codes() as $code ) {
				$coupon_lines[] = array( 'code' => $code );
			}

			$orders_out[] = array(
				'id'           => $order->get_id(),
				'number'       => $order->get_order_number(),
				'status'       => $order->get_status(),
				'total'        => $order->get_total(),
				'date_created' => $order->get_date_created() ? $order->get_date_created()->date( 'c' ) : null,
				'billing'      => array( 'email' => $order->get_billing_email() ),
				'customer_id'  => $order->get_customer_id(),
				'line_items'   => $line_items,
				'coupon_lines' => $coupon_lines,
			);
		}

		return $orders_out;
	}
}

<?php
/**
 * Plugin Name: Command Center Connector
 * Plugin URI:  https://example.com/command-center
 * Description: Connects this WooCommerce store to your Peptide Command Center account — registers the site automatically, wires up order webhooks, and keeps products/orders/customers in sync.
 * Version:     0.1.0
 * Author:      Your Company
 * Requires PHP: 7.4
 * WC requires at least: 5.0
 * Text Domain: command-center-connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'CC_CONNECTOR_VERSION', '0.1.0' );
define( 'CC_CONNECTOR_PATH', plugin_dir_path( __FILE__ ) );
define( 'CC_CONNECTOR_CRON_HOOK', 'cc_connector_scheduled_sync' );

require_once CC_CONNECTOR_PATH . 'includes/class-cc-api-client.php';
require_once CC_CONNECTOR_PATH . 'includes/class-cc-webhook-setup.php';
require_once CC_CONNECTOR_PATH . 'includes/class-cc-sync.php';
require_once CC_CONNECTOR_PATH . 'includes/class-cc-admin.php';

/**
 * Bail early (with an admin notice) if WooCommerce isn't active — every
 * feature here assumes wc_get_orders()/wc_get_products() exist.
 */
function cc_connector_missing_woocommerce_notice() {
	echo '<div class="notice notice-error"><p>';
	echo esc_html__( 'Command Center Connector requires WooCommerce to be installed and active.', 'command-center-connector' );
	echo '</p></div>';
}

function cc_connector_init() {
	if ( ! class_exists( 'WooCommerce' ) ) {
		add_action( 'admin_notices', 'cc_connector_missing_woocommerce_notice' );
		return;
	}

	new CC_Admin();
}
add_action( 'plugins_loaded', 'cc_connector_init' );

/**
 * Auto-sync safety net: in addition to the live order.created /
 * order.updated webhooks, run a full reconciliation sync on a schedule so
 * anything a dropped webhook missed still shows up in the Command Center.
 */
add_action( CC_CONNECTOR_CRON_HOOK, array( 'CC_Sync', 'run_scheduled_sync' ) );

function cc_connector_activate() {
	if ( ! wp_next_scheduled( CC_CONNECTOR_CRON_HOOK ) ) {
		wp_schedule_event( time() + HOUR_IN_SECONDS, 'twicedaily', CC_CONNECTOR_CRON_HOOK );
	}
}
register_activation_hook( __FILE__, 'cc_connector_activate' );

function cc_connector_deactivate() {
	wp_clear_scheduled_hook( CC_CONNECTOR_CRON_HOOK );
}
register_deactivation_hook( __FILE__, 'cc_connector_deactivate' );

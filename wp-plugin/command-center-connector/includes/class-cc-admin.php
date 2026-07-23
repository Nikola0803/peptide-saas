<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class CC_Admin {

	public function __construct() {
		add_action( 'admin_menu', array( $this, 'add_settings_page' ) );
		add_action( 'admin_post_cc_connector_connect', array( $this, 'handle_connect' ) );
		add_action( 'admin_post_cc_connector_sync_now', array( $this, 'handle_sync_now' ) );
		add_action( 'admin_post_cc_connector_disconnect', array( $this, 'handle_disconnect' ) );
	}

	public function add_settings_page() {
		add_options_page(
			'Command Center Connector',
			'Command Center',
			'manage_woocommerce',
			'command-center-connector',
			array( $this, 'render_settings_page' )
		);
	}

	private function get_settings() {
		return wp_parse_args(
			get_option( 'cc_connector_settings', array() ),
			array(
				'command_center_url' => '',
				'api_key'            => '',
				'brand_id'           => '',
				'brand_slug'         => '',
				'webhook_secret'     => '',
				'webhook_url'        => '',
				'last_synced_at'     => '',
			)
		);
	}

	public function render_settings_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}

		$settings   = $this->get_settings();
		$connected  = ! empty( $settings['brand_id'] );
		$notice     = get_transient( 'cc_connector_admin_notice' );
		delete_transient( 'cc_connector_admin_notice' );
		?>
		<div class="wrap">
			<h1>Command Center Connector</h1>

			<?php if ( $notice ) : ?>
				<div class="notice notice-<?php echo esc_attr( $notice['type'] ); ?>">
					<p><?php echo esc_html( $notice['message'] ); ?></p>
				</div>
			<?php endif; ?>

			<?php if ( $connected ) : ?>
				<div class="notice notice-success inline">
					<p>
						<strong>Connected</strong> as brand <code><?php echo esc_html( $settings['brand_slug'] ); ?></code>.
						<?php if ( $settings['last_synced_at'] ) : ?>
							Last synced <?php echo esc_html( $settings['last_synced_at'] ); ?>.
						<?php endif; ?>
					</p>
				</div>

				<h2>Sync</h2>
				<p>Pull every product and order into the Command Center now, in addition to the automatic order webhooks already configured.</p>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<?php wp_nonce_field( 'cc_connector_sync_now' ); ?>
					<input type="hidden" name="action" value="cc_connector_sync_now" />
					<?php submit_button( 'Sync all products & orders now', 'primary', 'submit', false ); ?>
				</form>

				<h2 style="margin-top:2em;">Disconnect</h2>
				<p>Removes the webhooks this plugin created here. The brand and its history remain in your Command Center account.</p>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<?php wp_nonce_field( 'cc_connector_disconnect' ); ?>
					<input type="hidden" name="action" value="cc_connector_disconnect" />
					<?php submit_button( 'Disconnect this site', 'delete', 'submit', false ); ?>
				</form>

			<?php else : ?>
				<p>Paste your organization's API key (found on the Command Center's Settings page) to connect this store.</p>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<?php wp_nonce_field( 'cc_connector_connect' ); ?>
					<input type="hidden" name="action" value="cc_connector_connect" />
					<table class="form-table">
						<tr>
							<th><label for="cc_command_center_url">Command Center URL</label></th>
							<td>
								<input type="url" required id="cc_command_center_url" name="command_center_url"
									value="<?php echo esc_attr( $settings['command_center_url'] ? $settings['command_center_url'] : 'https://app.yourcommandcenter.com' ); ?>"
									class="regular-text" />
							</td>
						</tr>
						<tr>
							<th><label for="cc_api_key">Organization API Key</label></th>
							<td>
								<input type="text" required id="cc_api_key" name="api_key" value="" class="regular-text" />
							</td>
						</tr>
					</table>
					<?php submit_button( 'Connect this site' ); ?>
				</form>
			<?php endif; ?>
		</div>
		<?php
	}

	public function handle_connect() {
		check_admin_referer( 'cc_connector_connect' );
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( 'Unauthorized' );
		}

		$command_center_url = isset( $_POST['command_center_url'] ) ? esc_url_raw( wp_unslash( $_POST['command_center_url'] ) ) : '';
		$api_key            = isset( $_POST['api_key'] ) ? sanitize_text_field( wp_unslash( $_POST['api_key'] ) ) : '';

		$result = CC_API_Client::register( $command_center_url, $api_key );

		if ( is_wp_error( $result ) ) {
			$this->set_notice( 'error', 'Connection failed: ' . $result->get_error_message() );
			$this->redirect_back();
		}

		update_option(
			'cc_connector_settings',
			array(
				'command_center_url' => $command_center_url,
				'api_key'            => $api_key,
				'brand_id'           => $result['brandId'],
				'brand_slug'         => $result['brandSlug'],
				'webhook_secret'     => $result['webhookSecret'],
				'webhook_url'        => $result['webhookUrl'],
				'last_synced_at'     => '',
			)
		);

		CC_Webhook_Setup::ensure_webhooks( $result['webhookUrl'], $result['webhookSecret'] );

		// Kick off the first full sync immediately, rather than waiting for
		// the next scheduled cron run.
		CC_Sync::run_scheduled_sync();

		$this->set_notice( 'success', 'Connected! Webhooks configured and an initial sync has started.' );
		$this->redirect_back();
	}

	public function handle_sync_now() {
		check_admin_referer( 'cc_connector_sync_now' );
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( 'Unauthorized' );
		}

		$settings = $this->get_settings();
		$result   = CC_Sync::sync_now( $settings );

		if ( is_wp_error( $result ) ) {
			$this->set_notice( 'error', 'Sync failed: ' . $result->get_error_message() );
		} else {
			$this->set_notice(
				'success',
				sprintf(
					'Synced %d products and %d orders.',
					isset( $result['productsUpserted'] ) ? (int) $result['productsUpserted'] : 0,
					isset( $result['ordersUpserted'] ) ? (int) $result['ordersUpserted'] : 0
				)
			);
		}

		$this->redirect_back();
	}

	public function handle_disconnect() {
		check_admin_referer( 'cc_connector_disconnect' );
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( 'Unauthorized' );
		}

		delete_option( 'cc_connector_settings' );
		$this->set_notice( 'success', 'Disconnected. Your data remains in the Command Center account.' );
		$this->redirect_back();
	}

	private function set_notice( $type, $message ) {
		set_transient( 'cc_connector_admin_notice', array( 'type' => $type, 'message' => $message ), 60 );
	}

	private function redirect_back() {
		wp_safe_redirect( admin_url( 'options-general.php?page=command-center-connector' ) );
		exit;
	}
}

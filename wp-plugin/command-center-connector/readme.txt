=== Command Center Connector ===
Contributors: yourcompany
Requires at least: 5.8
Tested up to: 6.6
Requires PHP: 7.4
Requires WooCommerce: 5.0 or later
Stable tag: 0.1.0
License: GPLv2 or later

Connects this WooCommerce store to your Peptide Command Center account.

== Description ==

Install and activate on any WooCommerce store you want to appear as a
brand in your Command Center account.

1. Go to Settings → Command Center.
2. Paste in your Command Center URL and your organization's API key
   (found on the Command Center's own Settings page).
3. Click "Connect this site". The plugin:
   - registers this site as a new brand automatically (no manual step
     needed in the dashboard),
   - configures native WooCommerce webhooks (order.created,
     order.updated) pointed at your Command Center,
   - runs an initial full sync of existing products and orders.

After that, new orders sync live via the webhooks, and a background
sync runs twice daily as a safety net. You can also trigger
"Sync all products & orders now" manually at any time from the same
settings page.

== Changelog ==

= 0.1.0 =
* Initial release: site registration, webhook auto-setup, product/order
  backfill, scheduled reconciliation sync.

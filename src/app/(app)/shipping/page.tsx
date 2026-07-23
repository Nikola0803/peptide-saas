import { StubPage } from "@/components/stub-page";

export default function ShippingPage() {
  return (
    <StubPage
      title="Shipping"
      subtitle="Fulfillment status and carrier tracking across all brands"
      icon="ri-ship-2-line"
      body="This will pull tracking numbers and delivery status from each brand's shipping plugin (e.g. WooCommerce Shipment Tracking) via the same sync pipeline as orders."
    />
  );
}

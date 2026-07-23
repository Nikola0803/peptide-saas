import { StubPage } from "@/components/stub-page";

export default function PaymentsPage() {
  return (
    <StubPage
      title="Payments"
      subtitle="Merchant processor payouts and reconciliation across all brands"
      icon="ri-bank-card-line"
      body="This will reconcile gross order totals against processor payout batches (Stripe / merchant-of-record) so net profit ties out to what actually lands in the bank."
    />
  );
}

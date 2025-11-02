import { RouteRedirect } from './_components/RouteRedirect';

export default function PaymentsScreen() {
  return (
    <RouteRedirect
      title="Payments"
      path="/payments"
      subtitle="Loading Stripe product preview from the Worker API."
    />
  );
}

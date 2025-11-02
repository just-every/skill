import { RouteRedirect } from './_components/RouteRedirect';

export default function AppScreen() {
  return (
    <RouteRedirect
      title="Dashboard"
      path="/app"
      subtitle="Rerouting to the authenticated Worker-powered dashboard."
    />
  );
}

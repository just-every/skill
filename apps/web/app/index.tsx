import { RouteRedirect } from './_components/RouteRedirect';

export default function LandingScreen() {
  return (
    <RouteRedirect
      title="justevery"
      path="/"
      subtitle="You will be redirected to the Cloudflare Worker marketing homepage."
    />
  );
}

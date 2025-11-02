import { RouteRedirect } from './_components/RouteRedirect';

export default function LoginScreen() {
  return (
    <RouteRedirect
      title="Sign in with Stytch"
      path="/login"
      subtitle="Taking you to the hosted login experience at login.justevery.com."
    />
  );
}

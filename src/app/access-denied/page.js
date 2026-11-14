import { Brand } from "@/components/brand";
import { signOutAction } from "@/app/actions";

export const metadata = { title: "Access not configured" };

export default function AccessDeniedPage() {
  return (
    <div className="site-wrap">
      <header className="site-header">
        <Brand />
        <form action={signOutAction}>
          <button className="text-link" type="submit">
            Sign out
          </button>
        </form>
      </header>
      <main className="narrow-page">
        <p className="eyebrow">Workspace access</p>
        <h1>Your access is not set up yet.</h1>
        <p className="page-intro">
          Your sign-in is valid, but your organization membership does not have
          an active office management role. Ask your organization administrator
          to grant the right access, then sign in again.
        </p>
      </main>
    </div>
  );
}

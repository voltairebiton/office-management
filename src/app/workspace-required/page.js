import { Brand } from "@/components/brand";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions";

export const metadata = { title: "Join a workspace" };

export default async function WorkspaceRequiredPage() {
  const { user, organizationId } = await requireUser();
  if (organizationId) redirect("/dashboard");

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
        <p className="eyebrow">One more step</p>
        <h1>Join your office workspace.</h1>
        <p className="page-intro">
          You’re signed in as {user.email}. Ask your administrator for a
          workspace invitation, then sign in through that invitation.
        </p>
        <section className="panel">
          <h2>Already have an invitation?</h2>
          <p>
            Open the invitation sent to your email address to join the
            organization.
          </p>
        </section>
      </main>
    </div>
  );
}

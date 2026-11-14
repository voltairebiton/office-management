import { Brand } from "@/components/brand";
import { requireOrganization } from "@/lib/auth";
import { officeModules } from "@/lib/modules";
import { signOutAction } from "@/app/actions";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const { user, role } = await requireOrganization();

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
      <main className="dashboard">
        <div className="dashboard-heading">
          <div>
            <p className="eyebrow">Workspace overview</p>
            <h1>Welcome{user.firstName ? `, ${user.firstName}` : ""}.</h1>
            <p className="page-intro">Your office workspace starts here.</p>
          </div>
          <span className="badge badge-green">Organization connected</span>
        </div>
        <section className="account-panel" aria-label="Your account">
          <div>
            <span className="label">Signed in as</span>
            <strong>{user.email}</strong>
          </div>
          <div>
            <span className="label">Workspace role</span>
            <strong>
              {role ? role.replaceAll("_", " ").replaceAll("-", " ") : "Member"}
            </strong>
          </div>
        </section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Office operations</p>
            <h2>Build your workspace.</h2>
          </div>
          <p>These workflows are planned for the next phase.</p>
        </div>
        <div className="module-grid">
          {officeModules.map((module) => (
            <article className="module-card" key={module.id}>
              <div className="module-top">
                <span className="module-number">{module.id}</span>
                <span className="badge">Planned</span>
              </div>
              <h3>{module.name}</h3>
              <p>{module.description}</p>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

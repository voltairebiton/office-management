import Link from "next/link";
import { Brand } from "@/components/brand";
import { getAuthConfiguration } from "@/lib/auth-config";
import { officeModules } from "@/lib/modules";

export default function HomePage() {
  const { ready } = getAuthConfiguration();

  return (
    <div className="site-wrap">
      <header className="site-header">
        <Brand />
        <Link href="/dashboard" className="text-link">
          Open workspace <span aria-hidden="true">↗</span>
        </Link>
      </header>
      <main id="main-content">
        <section className="hero">
          <p className="eyebrow">
            <span className="status-dot" /> One workspace. Every office.
          </p>
          <h1>
            A little more order.
            <br />
            <span>A better office day.</span>
          </h1>
          <p className="hero-copy">
            Bring your rooms, supplies, refreshments, and visitors together.
            Built for the people who keep the office running.
          </p>
          <div className="hero-actions">
            {ready ? (
              <a href="/auth/sign-in" className="button">
                Staff sign in <span aria-hidden="true">→</span>
              </a>
            ) : (
              <Link href="/setup" className="button">
                Set up your workspace <span aria-hidden="true">→</span>
              </Link>
            )}
            <Link href="/preview" className="text-link">
              Preview the dashboard <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>
        <section
          id="workspace"
          className="workspace-section"
          aria-labelledby="workspace-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">The workspace</p>
              <h2 id="workspace-title">Room for everything.</h2>
            </div>
            <p>
              Four connected areas.
              <br />
              Office workflows are coming next.
            </p>
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
        </section>
      </main>
      <footer className="site-footer">
        <span>Made for the everyday office.</span>
        <span>Office Management</span>
      </footer>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getAuthConfiguration } from "@/lib/auth-config";

export const metadata = { title: "Workspace setup" };

export default function SetupPage() {
  const configuration = getAuthConfiguration();
  if (configuration.ready) redirect("/dashboard");

  return (
    <div className="site-wrap">
      <header className="site-header">
        <Brand />
        <Link href="/" className="text-link">
          Back home
        </Link>
      </header>
      <main className="narrow-page">
        <p className="eyebrow">Administrator setup</p>
        <h1>Connect your workspace.</h1>
        <p className="page-intro">
          Configure WorkOS to enable staff sign-in. The repository README walks
          through the setup.
        </p>
        <section className="panel">
          <h2>Local configuration</h2>
          <ol className="setup-steps">
            <li>
              Copy <code>.env.example</code> to <code>.env.local</code>.
            </li>
            <li>
              Add your WorkOS client ID, cookie password, and callback URL.
            </li>
            <li>
              Configure the matching URLs in your WorkOS application and restart
              the development server.
            </li>
          </ol>
          {configuration.missing.length > 0 && (
            <>
              <h3>Missing values</h3>
              <ul className="config-list">
                {configuration.missing.map((key) => (
                  <li key={key}>
                    <code>{key}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
          {configuration.errors.length > 0 && (
            <ul className="config-list">
              {configuration.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </section>
        <p className="muted">
          Staff pages become available once authentication is configured.
        </p>
      </main>
    </div>
  );
}

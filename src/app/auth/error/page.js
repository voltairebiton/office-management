import Link from "next/link";
import { Brand } from "@/components/brand";
import { isSafeRequestReference } from "@/lib/diagnostics";

export const metadata = { title: "Sign-in interrupted" };

export default async function AuthenticationErrorPage({ searchParams }) {
  const params = await searchParams;
  const reference = isSafeRequestReference(params?.reference) ? params.reference : null;
  return (
    <div className="site-wrap">
      <header className="site-header">
        <Brand />
      </header>
      <main className="narrow-page">
        <p className="eyebrow">Sign-in interrupted</p>
        <h1>Let’s start again.</h1>
        <p className="page-intro">
          We couldn’t complete your sign-in. Try again to start a fresh session.
          If this keeps happening, contact your workspace administrator.
        </p>
        {reference && <p className="page-intro">Support reference: <code>{reference}</code></p>}
        <div className="hero-actions">
          <a href="/auth/sign-in" className="button">
            Try signing in again
          </a>
          <Link href="/" className="text-link">
            Back home
          </Link>
        </div>
      </main>
    </div>
  );
}

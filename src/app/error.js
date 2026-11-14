"use client";

export default function ErrorPage({ reset }) {
  return (
    <main className="narrow-page">
      <p className="eyebrow">Something went wrong</p>
      <h1>Let’s try that again.</h1>
      <p className="page-intro">
        We couldn’t load this page. Try again in a moment.
      </p>
      <button type="button" className="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}

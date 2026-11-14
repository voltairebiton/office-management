import Link from "next/link";

export default function NotFound() {
  return (
    <main className="narrow-page">
      <p className="eyebrow">Page not found</p>
      <h1>This room is empty.</h1>
      <p className="page-intro">The page you’re looking for isn’t here.</p>
      <Link href="/" className="button">
        Back home
      </Link>
    </main>
  );
}

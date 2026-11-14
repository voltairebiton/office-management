import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Office Management home">
      <span className="brand-mark" aria-hidden="true">
        om
      </span>
      <span>Office Management</span>
    </Link>
  );
}

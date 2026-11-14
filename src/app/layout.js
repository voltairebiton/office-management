import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { getAuthConfiguration } from "@/lib/auth-config";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { default: "Office Management", template: "%s · Office Management" },
  description:
    "A workspace for office locations, room inventory, refreshments, and visitors.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {getAuthConfiguration().ready ? (
          <AuthKitProvider>{children}</AuthKitProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}

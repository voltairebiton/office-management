import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { getAuthConfiguration } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!getAuthConfiguration().ready) redirect("/setup");
  redirect(await getSignInUrl({ returnTo: "/dashboard" }));
}

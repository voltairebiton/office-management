import { handleAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAuthConfiguration } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!getAuthConfiguration().ready) redirect("/setup");
  return handleAuth({
    returnPathname: "/dashboard",
    onError: () =>
      NextResponse.redirect(
        new URL("/auth/error", process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI),
      ),
  })(request);
}

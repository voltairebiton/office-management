import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { getAuthConfiguration } from "@/lib/auth-config";

export default function proxy(request, event) {
  if (!getAuthConfiguration().ready) return NextResponse.next();
  return authkitProxy()(request, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

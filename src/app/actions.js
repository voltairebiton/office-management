"use server";

import { signOut } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { getAuthConfiguration } from "@/lib/auth-config";

export async function signOutAction() {
  if (!getAuthConfiguration().ready) redirect("/");
  await signOut();
}

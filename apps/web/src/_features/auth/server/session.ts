import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { appUserRepository } from "@/_entities/user/index.server";
import type { CurrentAppUser } from "@/_entities/user/index.server";
import type { AuthUser } from "../model/auth";
import { isGoogleAuthConfigured } from "./auth-options";
import { getAuth } from "./auth";

export const getCurrentAppUser = cache(async () => {
  if (!isGoogleAuthConfigured()) return null;

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  return appUserRepository.resolve({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
});

export async function requireCurrentAppUser() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  return user;
}

export function toAuthUser(user: CurrentAppUser): AuthUser {
  const initials = user.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("vi"))
    .join("");

  return {
    initials: initials || "SI",
    name: user.displayName,
    email: user.email,
  };
}

import type { ReactNode } from "react";

import { AppShell } from "@/_app/ui/app-shell";
import { requireCurrentAppUser, toAuthUser } from "@/_features/auth/index.server";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const user = await requireCurrentAppUser();

  return <AppShell user={toAuthUser(user)}>{children}</AppShell>;
}

import { redirect } from "next/navigation";

import { LoginPage } from "@/_pages/login";
import {
  getCurrentAppUser,
  isGoogleAuthConfigured,
} from "@/_features/auth/index.server";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await getCurrentAppUser()) redirect("/");

  return <LoginPage googleEnabled={isGoogleAuthConfigured()} />;
}

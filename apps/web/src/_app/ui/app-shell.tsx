import type { ReactNode } from "react";
import { AppSidebar } from "@/_app/ui/app-sidebar";
import type { AuthUser } from "@/_features/auth";

export function AppShell({
  children,
  googleAuthEnabled,
  user,
}: {
  children: ReactNode;
  googleAuthEnabled: boolean;
  user: AuthUser | null;
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Bỏ qua điều hướng
      </a>
      <AppSidebar googleAuthEnabled={googleAuthEnabled} user={user} />
      <div className="app-main">{children}</div>
    </div>
  );
}

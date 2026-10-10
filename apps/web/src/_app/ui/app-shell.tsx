import type { ReactNode } from "react";
import { AppSidebar } from "@/_app/ui/app-sidebar";
import type { AuthUser } from "@/_features/auth";

export function AppShell({
  children,
  user,
}: {
  children: ReactNode;
  user: AuthUser;
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Bỏ qua điều hướng
      </a>
      <AppSidebar user={user} />
      <div className="app-main">{children}</div>
    </div>
  );
}

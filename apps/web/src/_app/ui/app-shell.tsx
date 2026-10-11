import type { CSSProperties, ReactNode } from "react";
import { AppSidebar } from "@/_app/ui/app-sidebar";
import type { AuthUser } from "@/_features/auth";
import { SidebarProvider } from "@/components/ui/sidebar";

export function AppShell({
  children,
  user,
}: {
  children: ReactNode;
  user: AuthUser;
}) {
  return (
    <SidebarProvider
      className="app-shell"
      style={{ "--sidebar-width": "272px" } as CSSProperties}
    >
      <a className="skip-link" href="#main-content">
        Bỏ qua điều hướng
      </a>
      <AppSidebar user={user} />
      <div className="app-main">{children}</div>
    </SidebarProvider>
  );
}

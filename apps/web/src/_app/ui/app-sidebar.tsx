import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { mainNavigation } from "@/_app/config/navigation";
import { BrandMark } from "@/_shared/ui/brand-mark";
import { SidebarAuth, type AuthUser } from "@/_features/auth";

export function AppSidebar({
  user,
}: {
  user: AuthUser;
}) {
  return (
    <aside className="app-sidebar">
      <Link className="sidebar-brand" href="/" aria-label="Smart Idea, tổng quan">
        <BrandMark />
        <span className="brand-copy">
          <span className="brand-name">Smart Idea</span>
          <span className="brand-caption">A SPACE FOR WHAT&apos;S NEXT</span>
        </span>
      </Link>

      <div className="sidebar-section">
        <p className="sidebar-section-label">KHÔNG GIAN</p>
        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {mainNavigation.map((item) => (
            <Link
              aria-current="page"
              className="sidebar-link is-active"
              href={item.href}
              key={item.href}
            >
              <LayoutDashboard aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
      <SidebarAuth user={user} />
    </aside>
  );
}

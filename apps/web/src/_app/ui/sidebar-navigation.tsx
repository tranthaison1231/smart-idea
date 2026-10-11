"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Lightbulb, Sparkles } from "lucide-react";

import { mainNavigation } from "@/_app/config/navigation";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function SidebarNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Điều hướng chính">
      <SidebarMenu className="sidebar-nav">
        {mainNavigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.href === "/"
            ? LayoutDashboard
            : item.href === "/discover"
              ? Sparkles
              : Lightbulb;

          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                className="sidebar-link"
                isActive={isActive}
                size="lg"
              >
                <Link aria-current={isActive ? "page" : undefined} href={item.href}>
                  <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/_shared/ui/brand-mark";
import { SidebarAuth, type AuthUser } from "@/_features/auth";
import { SettingsDialog } from "@/_features/settings";
import { SidebarNavigation } from "./sidebar-navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarSeparator,
} from "@/components/ui/sidebar";

export function AppSidebar({
  user,
}: {
  user: AuthUser;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <Sidebar collapsible="none" className="app-sidebar">
      <SidebarHeader className="sidebar-header">
        <Link className="sidebar-brand" href="/" aria-label="Smart Idea, tổng quan">
          <BrandMark />
          <span className="brand-copy">
            <span className="brand-name">Smart Idea</span>
            <span className="brand-caption">A SPACE FOR WHAT&apos;S NEXT</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="sidebar-section">
          <SidebarGroupLabel className="sidebar-section-label">KHÔNG GIAN</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarNavigation />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="sidebar-footer">
        <SidebarSeparator />
        <SidebarAuth onOpenSettings={() => setSettingsOpen(true)} user={user} />
      </SidebarFooter>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Sidebar>
  );
}

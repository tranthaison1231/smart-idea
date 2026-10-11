"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut } from "lucide-react";

import type { AuthUser } from "../model/auth";
import { authClient } from "../client/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function SidebarAuth({
  user,
  onOpenSettings,
}: {
  user: AuthUser;
  onOpenSettings: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Không thể đăng xuất. Vui lòng thử lại.");
        return;
      }
      router.refresh();
    } catch {
      setError("Không thể đăng xuất. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="sidebar-auth">
      <div className="sidebar-account">
        <button
          aria-label={`Mở cài đặt tài khoản ${user.name}`}
          className="sidebar-account-trigger"
          onClick={onOpenSettings}
          title="Cài đặt tài khoản"
          type="button"
        >
          <Avatar className="sidebar-account-avatar">
            <AvatarFallback>{user.initials}</AvatarFallback>
          </Avatar>
          <span className="sidebar-account-copy">
            <span className="sidebar-account-name">{user.name}</span>
            <span className="sidebar-account-email">{user.email}</span>
          </span>
        </button>
        <Button
          aria-busy={pending}
          aria-label={pending ? "Đang đăng xuất" : "Đăng xuất"}
          className="sidebar-auth-icon-button"
          disabled={pending}
          onClick={() => void signOut()}
          title={pending ? "Đang đăng xuất" : "Đăng xuất"}
          type="button"
          size="icon"
          variant="ghost"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="is-spinning" size={17} />
          ) : (
            <LogOut aria-hidden="true" size={17} />
          )}
        </Button>
      </div>
      {error ? (
        <p className="sidebar-auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

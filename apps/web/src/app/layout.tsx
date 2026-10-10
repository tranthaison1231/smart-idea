import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/_app/ui/app-shell";
import {
  getCurrentAppUser,
  isGoogleAuthConfigured,
  toAuthUser,
} from "@/_features/auth/index.server";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Smart Idea — Một không gian cho điều tiếp theo",
    template: "%s | Smart Idea",
  },
  description:
    "Một nền tảng mở, sẵn sàng phát triển theo ý tưởng bạn chọn.",
};

export const viewport: Viewport = {
  themeColor: "#091321",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const googleAuthEnabled = isGoogleAuthConfigured();
  const currentUser = googleAuthEnabled ? await getCurrentAppUser() : null;

  return (
    <html lang="vi">
      <body>
        <AppShell
          googleAuthEnabled={googleAuthEnabled}
          user={currentUser ? toAuthUser(currentUser) : null}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}

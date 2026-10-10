import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

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

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi" className="dark">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}

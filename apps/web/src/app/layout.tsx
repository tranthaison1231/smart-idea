import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
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

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

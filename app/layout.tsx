import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teaching Aid",
  description: "讓語言老師用遊戲來教學的網站",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}

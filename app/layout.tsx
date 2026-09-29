import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import WelcomeDialog from "@/components/WelcomeDialog";
import Workspace from "@/components/Workspace";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teaching Aid",
  description: "讓語言老師用遊戲來教學的網站",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        {/* Zhuyin fonts: each character shows its 注音 beside it. Loaded per character range, only when used. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bpmf+Huninn&family=Bpmf+Iansui&family=Bpmf+Zihi+Kai+Std&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <Sidebar />
          <main className="stage">
            <Workspace />
            {children}
          </main>
        </div>
        <WelcomeDialog />
      </body>
    </html>
  );
}

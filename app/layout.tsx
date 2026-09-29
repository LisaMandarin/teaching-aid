import type { Metadata } from "next";
import { LXGW_WenKai_TC, Noto_Sans_TC } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import WelcomeDialog from "@/components/WelcomeDialog";
import Workspace from "@/components/Workspace";
import "./globals.css";

// Theme fonts (see school-theme.css): --font-chalk for headings, the board and buttons; --font-body for the rest.
// Chinese fonts have no subset to preload, so the browser fetches only the character ranges a page uses.
const chalk = LXGW_WenKai_TC({ weight: ["400", "700"], preload: false, variable: "--font-wenkai" });
const body = Noto_Sans_TC({ preload: false, variable: "--font-noto-tc" });

export const metadata: Metadata = {
  title: "教學便利通",
  description: "讓語言老師用遊戲來教學的網站",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className={`${chalk.variable} ${body.variable}`}>
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

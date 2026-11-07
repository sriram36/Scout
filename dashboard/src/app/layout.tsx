import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/lib/themeScript";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });
const text = Instrument_Sans({ variable: "--font-text", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Scout: job application pipeline",
  description: "Track discovered roles, queue auto-fill and review applications before they go out.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121a22" },
    { media: "(prefers-color-scheme: light)", color: "#eef2f6" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" className={`${display.variable} ${text.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

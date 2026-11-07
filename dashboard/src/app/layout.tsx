import type { Metadata, Viewport } from "next";
import { THEME_BOOT_SCRIPT } from "@/lib/themeScript";
import "./globals.css";

// Fonts are self-hosted (public/fonts, declared in globals.css): next/font/google could not be
// resolved by Vercel's build.
const PRELOADED_FONTS = ["/fonts/instrument-sans-latin.woff2", "/fonts/bricolage-grotesque-latin.woff2"];

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
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {PRELOADED_FONTS.map(href => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

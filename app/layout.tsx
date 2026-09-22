import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { LanguageProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: {
    default: "JeevanSetu 360",
    template: "%s · JeevanSetu 360",
  },
  description:
    "Real-time emergency coordination for Nagpur: the right hospital, not merely the nearest one. Hackathon prototype with fictional data.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#dc2626",
};

/**
 * `lang="en"` is the honest value for the server render: the chosen locale lives in the browser,
 * so the server cannot know it. LanguageProvider corrects the attribute after mount, which is
 * what a screen reader reads its voice from.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
          <AppShell>{children}</AppShell>
        </LanguageProvider>
      </body>
    </html>
  );
}

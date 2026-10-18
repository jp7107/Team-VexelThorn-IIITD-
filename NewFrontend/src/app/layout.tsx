import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kisan Mitra — Smart Farming Dashboard",
  description:
    "Crop disease checks, mandi prices, direct buyers and scheme updates for farmers. Kisan Mitra dashboard.",
  applicationName: "Kisan Mitra",
};

export const viewport: Viewport = {
  themeColor: "#f4f8f4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>
          <SessionProvider>{children}</SessionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

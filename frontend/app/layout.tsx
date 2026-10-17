import type { Metadata, Viewport } from "next";
import { Mukta } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

// One family drawn for Devanagari and Latin together, so Hindi and English sit on the same rhythm.
const mukta = Mukta({
  variable: "--font-mukta",
  subsets: ["devanagari", "latin"],
  weight: ["400", "600", "800"],
});

export const metadata: Metadata = {
  title: "KisanSetu",
  description: "Crop disease checks, mandi prices and direct buyers for farmers.",
  appleWebApp: { capable: true, title: "KisanSetu" },
};

export const viewport: Viewport = {
  themeColor: "#1f2a6b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hi" className={`${mukta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Mukta } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

// One family drawn for Devanagari and Latin together, so Hindi and English sit on the same rhythm.
const mukta = Mukta({
  variable: "--font-mukta",
  subsets: ["devanagari", "latin"],
  weight: ["400", "600", "800"],
});

// Headings and numbers: a grotesk with character, so the app doesn't read as a template.
// It has no Devanagari, so Hindi headings fall through to Mukta in the same stack.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});

export const metadata: Metadata = {
  title: "Kisan Mitra",
  description: "Crop disease checks, mandi prices and direct buyers for farmers.",
  appleWebApp: { capable: true, title: "Kisan Mitra" },
};

export const viewport: Viewport = {
  themeColor: "#1f6b3a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hi" className={`${mukta.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}

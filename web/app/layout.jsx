import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";

export const metadata = {
  title: "Kisan Mitra",
  description:
    "Farmer advisory and marketplace: crop disease check, plain-language guidance, direct buyer connection.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f6b3a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="hi" suppressHydrationWarning>
      <head>
        {/* Noto Sans Devanagari keeps Hindi glyphs consistent across phones
            (§2.6, R-14). Loaded with display=swap so text paints immediately. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap"
        />
      </head>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}

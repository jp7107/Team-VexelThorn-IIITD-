import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KisanSetu",
    short_name: "KisanSetu",
    description: "Crop disease checks, mandi prices and direct buyers for farmers.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f2a6b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kisan Mitra",
    short_name: "Kisan Mitra",
    description: "Crop disease checks, mandi prices and direct buyers for farmers.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5fbf6",
    theme_color: "#1f6b3a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

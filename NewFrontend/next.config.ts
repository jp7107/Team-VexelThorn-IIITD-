import type { NextConfig } from "next";

// Auth is an httpOnly `session` cookie owned by the FastAPI backend. Proxying /api/* same-origin through
// Next is what makes the cookie work without touching backend CORS (same pattern as the existing frontend).
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // The dev-tools badge sits over the sidebar art and skews screenshot comparisons.
  devIndicators: false,
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;

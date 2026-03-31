import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Static export for production — served by Hono
  ...(isProd && {
    output: "export",
    trailingSlash: true,
  }),

  // Proxy API calls to backend in dev only (rewrites not supported in static export)
  ...(!isProd && {
    async rewrites() {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3579";
      return [
        { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
        { source: "/ws/:path*", destination: `${apiBase}/ws/:path*` },
      ];
    },
  }),

  experimental: {
    // Use React 19 features
  },
};

export default nextConfig;

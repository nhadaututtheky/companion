import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Transpile workspace packages so Next.js can resolve their TS sources
  transpilePackages: ["@companion/shared"],

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

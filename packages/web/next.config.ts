import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API calls to backend in dev
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3579";
    return [
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
      { source: "/ws/:path*", destination: `${apiBase}/ws/:path*` },
    ];
  },

  experimental: {
    // Use React 19 features
  },
};

export default nextConfig;

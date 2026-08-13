import type { NextConfig } from "next";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

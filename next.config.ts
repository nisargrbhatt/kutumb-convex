import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typedRoutes: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

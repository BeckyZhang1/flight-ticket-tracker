import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@flight/contracts", "@flight/domain"]
};

export default nextConfig;

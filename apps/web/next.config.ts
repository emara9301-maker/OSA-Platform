import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Package photos are uploaded through a server action, so the default 1MB limit is too small.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;

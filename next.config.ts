import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The password-gate middleware caps request bodies at 10MB by default;
    // X archive tweets.js files easily exceed that (24MB for ~12k tweets).
    middlewareClientMaxBodySize: "64mb",
  },
};

export default nextConfig;

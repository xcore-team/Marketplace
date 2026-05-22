import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/app/:path*",
        destination: "https://api.xcorehub.dev/app/:path*",
      },
    ];
  },
};

export default nextConfig;

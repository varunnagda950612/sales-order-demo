import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/service-worker.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

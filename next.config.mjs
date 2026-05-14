/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Admin panel is completely isolated — no public CORS
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Robots-Tag",          value: "noindex, nofollow" },
        { key: "X-Frame-Options",        value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    },
  ],
};

export default nextConfig;

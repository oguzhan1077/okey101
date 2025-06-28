import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Netlify Next.js runtime kullanacak
  // Static export yerine server-side rendering
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

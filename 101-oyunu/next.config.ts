import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build optimizasyonları
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Image optimizasyonu Netlify için
  images: {
    unoptimized: true,
  },
  
  // Clean configuration - Netlify plugin handles routing
};

export default nextConfig;

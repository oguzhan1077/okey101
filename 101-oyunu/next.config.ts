import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export - Netlify'da garantili çalışır
  output: 'export',
  trailingSlash: true,
  
  // Build optimizasyonları
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Image optimizasyonu - static export için gerekli
  images: {
    unoptimized: true,
  },
  
  // Static export için gerekli
  distDir: 'out',
};

export default nextConfig;

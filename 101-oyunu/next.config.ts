import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal configuration
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    // Kayıtlara yazılan uygulama sürümü (Netlify derlemede COMMIT_REF verir)
    NEXT_PUBLIC_APP_VERSION: process.env.COMMIT_REF?.slice(0, 7) || 'dev',
  },
};

export default nextConfig;

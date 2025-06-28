import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Netlify için optimize edilmiş ayarlar
  output: 'standalone', // Netlify için optimum
  trailingSlash: true,
  
  // Build optimizasyonları
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Image optimizasyonu (Netlify'da sorun çıkarabilir)
  images: {
    unoptimized: true,
  },
  
  // Experimental özellikler - Turbopack uyumlulukları
  // experimental.esmExternals kaldırıldı (Turbopack uyumsuzluğu)
};

export default nextConfig;

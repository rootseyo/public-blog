import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["pg", "pg-pool", "pg-protocol", "pg-cloudflare"],
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp'], // AVIF는 CPU 소모가 커서 WebP를 우선 권장
  },
  async redirects() {
    return [
      {
        source: '/bamboo',
        destination: '/shorts',
        permanent: true,
      },
      {
        source: '/bamboo/:slug*',
        destination: '/shorts/:slug*',
        permanent: true,
      },
      {
        source: '/admin/bamboo',
        destination: '/admin/shorts',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from 'next';

const staticExport = process.env.STATIC_EXPORT === '1';
const basePath = process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  output: staticExport ? 'export' : 'standalone',
  trailingSlash: staticExport,
  images: { unoptimized: true },
  transpilePackages: ['@finamx/extension-sdk', '@finamx/bridge-protocol'],
  ...(basePath && staticExport ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;

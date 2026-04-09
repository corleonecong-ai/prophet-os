/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['js-yaml'],
  },
};

export default nextConfig;

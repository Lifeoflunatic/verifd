/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@verifd/shared'],
  experimental: {
    typedRoutes: true
  },
  env: {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3001'
  }
};

module.exports = nextConfig;
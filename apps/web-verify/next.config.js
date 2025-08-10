/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true
  },
  env: {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3001'
  }
};

module.exports = nextConfig;
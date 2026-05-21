/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permite iframes dos dashboards Vercel existentes
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

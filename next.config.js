/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@heroui/button',
      '@heroui/card',
      '@heroui/chip',
      '@heroui/input',
      '@heroui/modal',
      '@heroui/select',
      '@heroui/tabs',
      '@heroui/tooltip',
      '@heroui/switch',
      '@heroui/spinner',
      '@heroui/divider',
      '@heroui/dropdown',
      '@heroui/checkbox',
      '@heroui/snippet',
      '@heroui/code',
      '@heroui/link',
      '@heroui/toast',
    ],
  },

  // In showcase mode, redirect protected routes to home at the edge
  async redirects() {
    const isShowcaseMode = process.env.NEXT_PUBLIC_SHOWCASE_MODE === 'true';

    if (!isShowcaseMode) {
      return [];
    }

    // Page routes that should redirect to home in showcase mode
    const blockedPageRoutes = [
      '/signin',
      '/dashboard',
      '/dashboard/:path*',
      '/settings',
      '/settings/:path*',
    ];

    return blockedPageRoutes.map((source) => ({
      source,
      destination: '/',
      permanent: false, // 307 temporary redirect
    }));
  },

  // In showcase mode, rewrite blocked API routes to return 404
  async rewrites() {
    const isShowcaseMode = process.env.NEXT_PUBLIC_SHOWCASE_MODE === 'true';

    if (!isShowcaseMode) {
      return [];
    }

    // API routes that should be blocked in showcase mode
    // These will return 404 instead of exposing functionality
    const blockedApiRoutes = [
      '/api/user/:path*',
      '/api/claude-md',
      '/api/ask',
      '/api/edit',
      '/api/workspaces/:path*',
      '/api/config/:path*',
      '/api/jobs/:path*',
      '/api/auth/:path*',
    ];

    // Rewrite to a non-existent path to trigger 404
    return blockedApiRoutes.map((source) => ({
      source,
      destination: '/api/__blocked__',
    }));
  },
};

export default nextConfig;

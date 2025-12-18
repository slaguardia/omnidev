'use client';

import { usePathname } from 'next/navigation';

export function Footer() {
  const pathname = usePathname();

  // Hide footer on dashboard pages
  if (pathname?.startsWith('/dashboard')) {
    return null;
  }

  return (
    <footer className="w-full flex items-center justify-center py-6 bg-background/80 backdrop-blur-sm">
      <div className="text-sm text-default-500">
        © {new Date().getFullYear()} CodeSpider. All rights reserved.
      </div>
    </footer>
  );
}

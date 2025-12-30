'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { docsConfig } from '@/lib/docs/config';

export function DocsNavigation() {
  const pathname = usePathname();

  // Match the main content height calculation (viewport minus navbar)
  const NAVBAR_HEIGHT = '4rem';

  return (
    <nav
      className="w-full glass-card-static overflow-hidden flex flex-col mb-6"
      style={{ maxHeight: `calc(100vh - ${NAVBAR_HEIGHT} - 3rem)` }}
    >
      <div className="p-4 space-y-6 overflow-y-auto flex-1 scrollbar-thin">
        {docsConfig.map((section) => (
          <div key={section.title}>
            <h3 className="text-xs font-semibold text-default-500 uppercase tracking-wider mb-2">
              {section.title}
            </h3>
            <ul className="space-y-1">
              {section.pages.map((page) => {
                const href = `/docs/${page.slug}`;
                const isActive = pathname === href;

                return (
                  <li key={page.slug}>
                    <Link
                      href={href}
                      scroll={false}
                      onClick={() => {
                        // Scroll content container to top on navigation
                        const container = document.querySelector('[data-docs-content]');
                        if (container) container.scrollTo({ top: 0 });
                      }}
                      className={`
                        block px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-default-700 hover:bg-default-100 hover:text-default-900'
                        }
                      `}
                    >
                      {page.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { docsConfig } from '@/lib/docs/config';
import * as ScrollArea from '@radix-ui/react-scroll-area';

export function DocsNavigation() {
  const pathname = usePathname();

  return (
    <nav className="w-full h-full">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Documentation</h2>
      </div>

      <ScrollArea.Root className="h-full overflow-hidden">
        <ScrollArea.Viewport className="w-full h-full">
          <div className="space-y-6">
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
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          className="flex select-none touch-none p-0.5 bg-transparent transition-colors duration-150 ease-out hover:bg-default-100 data-[orientation=vertical]:w-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:h-2.5"
          orientation="vertical"
        >
          <ScrollArea.Thumb className="flex-1 bg-default-300 rounded-full relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[44px] before:min-h-[44px]" />
        </ScrollArea.Scrollbar>
        <ScrollArea.Corner className="bg-default-100" />
      </ScrollArea.Root>
    </nav>
  );
}

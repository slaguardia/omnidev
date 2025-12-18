'use client';

import React, { useEffect, useState } from 'react';
import { Heading } from '@/lib/docs/markdown';

export interface TableOfContentsProps {
  headings: Heading[];
}

export function TableOfContents({ headings }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    // Track which heading is currently visible
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-80px 0px -80% 0px',
        threshold: 1,
      }
    );

    // Observe all headings
    headings.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [headings]);

  if (headings.length === 0) {
    return null;
  }

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    const scrollContainer = document.querySelector('[data-docs-content]') as HTMLElement | null;

    if (element && scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const scrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - 20;
      scrollContainer.scrollTo({ top: scrollTop, behavior: 'instant' });
      window.history.pushState(null, '', `#${id}`);
      setActiveId(id);
    }
  };

  return (
    <nav className="space-y-2 pb-4 p-4 rounded-lg border border-divider/50 bg-content1/50">
      <h3 className="text-sm font-semibold text-default-700 mb-4">On this page</h3>
      <ul className="space-y-2 text-sm">
        {headings.map((heading) => {
          const isActive = activeId === heading.id;
          const paddingLeft = (heading.level - 1) * 12;

          return (
            <li key={heading.id} style={{ paddingLeft: `${paddingLeft}px` }}>
              <a
                href={`#${heading.id}`}
                onClick={(e) => handleClick(e, heading.id)}
                className={`
                  block py-1.5 border-l-2 pl-3 transition-colors duration-200
                  ${
                    isActive
                      ? 'border-primary text-primary font-medium'
                      : 'border-transparent text-default-600 hover:text-default-900 hover:border-default-300'
                  }
                `}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

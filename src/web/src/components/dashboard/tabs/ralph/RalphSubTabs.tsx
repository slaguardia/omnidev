'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@heroui/button';
import { useRalphBoardSubtabHoverPrefetch } from '@/hooks/queries/useRalphBoardSubtabHoverPrefetch';

const subTabs = [
  { key: 'board', title: 'Board', href: '/dashboard/ralph-board' },
  { key: 'projects', title: 'Projects', href: '/dashboard/ralph-board/projects' },
  { key: 'workflow', title: 'Workflow', href: '/dashboard/ralph-board/workflow' },
  { key: 'playbooks', title: 'Playbooks', href: '/dashboard/ralph-board/playbooks' },
];

function getActiveSubTab(pathname: string): string {
  const segment = pathname.split('/')[3]; // /dashboard/ralph-board/[subtab]
  if (segment === 'projects' || segment === 'workflow' || segment === 'playbooks') return segment;
  return 'board';
}

export function RalphSubTabs({ trailing }: { trailing?: React.ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const prefetchOnHover = useRalphBoardSubtabHoverPrefetch(queryClient);
  const activeSubTab = getActiveSubTab(pathname);

  return (
    <div className="flex justify-between items-center flex-wrap gap-4">
      <nav className="flex flex-wrap gap-2" aria-label="Ralph board sections">
        {subTabs.map((tab) => {
          const isActive = activeSubTab === tab.key;
          return (
            <Button
              key={tab.key}
              as={NextLink}
              href={tab.href}
              scroll={false}
              size="md"
              color="primary"
              variant={isActive ? 'flat' : 'light'}
              className="font-medium"
              onMouseEnter={() => prefetchOnHover(tab.key)}
            >
              {tab.title}
            </Button>
          );
        })}
      </nav>
      {trailing}
    </div>
  );
}

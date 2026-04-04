'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, Tab } from '@heroui/tabs';

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
  const activeSubTab = getActiveSubTab(pathname);

  return (
    <div className="flex justify-between items-center flex-wrap gap-4">
      <Tabs
        selectedKey={activeSubTab}
        size="md"
        color="primary"
        variant="light"
        classNames={{
          tabList: 'gap-2',
          panel: 'hidden',
          cursor: 'opacity-0 data-[initialized]:opacity-100',
        }}
      >
        {subTabs.map((tab) => (
          <Tab
            key={tab.key}
            title={
              <NextLink href={tab.href} className="block w-full h-full">
                {tab.title}
              </NextLink>
            }
          />
        ))}
      </Tabs>
      {trailing}
    </div>
  );
}

'use client';

import {
  FolderOpen,
  Bot,
  Settings,
  GitBranch,
  Lock,
  History,
  ListOrdered,
  Code,
} from 'lucide-react';
import clsx from 'clsx';

interface DashboardNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navItems = [
  { key: 'workspaces', title: 'Workspaces', icon: FolderOpen },
  { key: 'operations', title: 'Operations', icon: Bot },
  { key: 'queue', title: 'Request Queue', icon: ListOrdered },
  { key: 'history', title: 'Execution History', icon: History },
  { key: 'git-source', title: 'Git Source Config', icon: GitBranch },
  { key: 'snippets', title: 'Snippets', icon: Code },
  { key: 'settings', title: 'Environment Settings', icon: Settings },
  { key: 'security', title: 'Account Security', icon: Lock },
];

export function DashboardNavigation({ activeTab, onTabChange }: DashboardNavigationProps) {
  return (
    <nav className="w-full">
      <ul className="space-y-0.5">
        {navItems.map((item) => {
          const isActive = activeTab === item.key;
          const Icon = item.icon;

          return (
            <li key={item.key}>
              <button
                onClick={() => onTabChange(item.key)}
                className={clsx(
                  'group relative w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors text-left',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive
                    ? 'bg-content2 text-foreground shadow-sm'
                    : 'text-default-600 hover:text-foreground hover:bg-content2/60'
                )}
              >
                <span
                  className={clsx(
                    'absolute left-1.5 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-primary transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'
                  )}
                  aria-hidden="true"
                />
                <Icon
                  className={clsx(
                    'w-4 h-4 transition-colors',
                    isActive ? 'text-primary' : 'text-default-400 group-hover:text-default-600'
                  )}
                />
                {item.title}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

'use client';

import { FolderOpen, Bot, Settings, GitBranch, Lock, History, ListOrdered } from 'lucide-react';

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
  { key: 'settings', title: 'Environment Settings', icon: Settings },
  { key: 'security', title: 'Account Security', icon: Lock },
];

export function DashboardNavigation({ activeTab, onTabChange }: DashboardNavigationProps) {
  return (
    <nav className="w-full">
      <ul className="space-y-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.key;
          const Icon = item.icon;

          return (
            <li key={item.key}>
              <button
                onClick={() => onTabChange(item.key)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left
                  ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-default-700 hover:bg-default-100 hover:text-default-900'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {item.title}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

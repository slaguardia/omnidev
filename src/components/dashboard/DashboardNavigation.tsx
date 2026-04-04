'use client';

import { useState } from 'react';
import {
  FolderOpen,
  Bot,
  Settings,
  GitBranch,
  Lock,
  Clock,
  Zap,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Search,
  LogOut,
} from 'lucide-react';
import clsx from 'clsx';
import { Tooltip } from '@heroui/tooltip';
import { Kbd } from '@heroui/kbd';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { usePersistedState } from '@/hooks';
import { motion, AnimatePresence } from '@/components/motion';
import { siteConfig } from '@/lib/config/site';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import type { LucideIcon } from 'lucide-react';

interface DashboardNavigationProps {
  collapsed?: boolean;
  onOpenPalette: () => void;
}

interface NavItem {
  key: string;
  title: string;
  icon: LucideIcon;
}

const topNavItems: NavItem[] = [
  { key: 'ralph-board', title: 'Ralph Board', icon: Zap },
  { key: 'chat', title: 'Chat', icon: MessageSquare },
  { key: 'operations', title: 'Operations', icon: Bot },
  { key: 'external-tasking', title: 'External Tasking', icon: Clock },
];

const configNavItems: NavItem[] = [
  { key: 'workspaces', title: 'Workspaces', icon: FolderOpen },
  { key: 'git-source', title: 'Git Source Config', icon: GitBranch },
  { key: 'settings', title: 'Environment Settings', icon: Settings },
  { key: 'security', title: 'Account Security', icon: Lock },
];

const configTabKeys = new Set(configNavItems.map((item) => item.key));

function NavLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Tooltip content={item.title} placement="right" isDisabled={!collapsed}>
        <NextLink
          href={`/dashboard/${item.key}`}
          className={clsx(
            'group w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap overflow-hidden text-left',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isActive
              ? 'bg-content2/80 text-foreground border-l-2 border-primary'
              : 'text-default-500 hover:text-foreground hover:bg-content2/40'
          )}
        >
          <Icon
            className={clsx(
              'w-4 h-4 shrink-0 transition-colors',
              isActive ? 'text-primary' : 'text-default-400 group-hover:text-default-600'
            )}
          />
          {item.title}
        </NextLink>
      </Tooltip>
    </li>
  );
}

export function DashboardNavigation({ collapsed, onOpenPalette }: DashboardNavigationProps) {
  const pathname = usePathname();
  const activeTab = pathname.split('/')[2] || 'ralph-board';

  const [configExpanded, setConfigExpanded] = usePersistedState(
    'dashboard-nav-config-expanded',
    false
  );
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false);

  // Auto-expand config section if active tab is inside it (but only once per mount to avoid fighting user)
  if (!hasAutoExpanded && !configExpanded && configTabKeys.has(activeTab)) {
    setConfigExpanded(true);
    setHasAutoExpanded(true);
  }

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/signin' });
  };

  const isActive = (key: string) => pathname.startsWith(`/dashboard/${key}`);

  return (
    <nav className="h-full flex flex-col w-full">
      {/* Brand */}
      {collapsed ? (
        <div className="flex justify-center mb-4">
          <NextLink
            href="/"
            className="font-title font-semibold text-lg bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-primary-400"
          >
            O
          </NextLink>
        </div>
      ) : (
        <NextLink href="/" className="block px-3 mb-4">
          <span className="font-title font-semibold tracking-tight text-xl bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-primary-400">
            {siteConfig.name}
          </span>
        </NextLink>
      )}

      {/* Search button */}
      <div className="mb-4 px-0">
        <Tooltip content="Search" placement="right" isDisabled={!collapsed}>
          <button
            onClick={onOpenPalette}
            className={clsx(
              'w-full flex items-center gap-2 rounded-md bg-content2/60 hover:bg-content2 border border-divider/60 transition-colors text-sm text-default-500',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              collapsed ? 'justify-center px-2' : 'px-3',
              'h-9'
            )}
          >
            <Search className="w-4 h-4 text-default-400 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Search...</span>
                <Kbd className="hidden lg:inline-block" keys={['command']}>
                  K
                </Kbd>
              </>
            )}
          </button>
        </Tooltip>
      </div>

      {/* Top-level tabs */}
      <ul className="space-y-0.5">
        {topNavItems.map((item) => (
          <NavLink
            key={item.key}
            item={item}
            isActive={isActive(item.key)}
            collapsed={collapsed ?? false}
          />
        ))}
      </ul>

      {/* Configuration section */}
      <div className="mt-4">
        {collapsed ? (
          <>
            <Tooltip content="Configuration" placement="right">
              <div className="flex justify-center py-1.5 mb-1">
                <div className="w-6 h-px bg-divider" />
              </div>
            </Tooltip>
            <ul className="space-y-0.5">
              {configNavItems.map((item) => (
                <NavLink
                  key={item.key}
                  item={item}
                  isActive={isActive(item.key)}
                  collapsed={collapsed ?? false}
                />
              ))}
            </ul>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfigExpanded((prev) => !prev)}
              className="w-full flex items-center px-3 py-1.5 text-xs font-semibold text-default-500 uppercase tracking-wider hover:text-default-700 transition-colors rounded-lg"
              aria-expanded={configExpanded}
            >
              <span className="flex items-center gap-1">
                Configuration
                {configExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {configExpanded && (
                <motion.ul
                  key="config-items"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  className="overflow-hidden space-y-0.5"
                >
                  {configNavItems.map((item) => (
                    <NavLink
                      key={item.key}
                      item={item}
                      isActive={isActive(item.key)}
                      collapsed={collapsed ?? false}
                    />
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Theme switch */}
      <div
        className={clsx(
          'mt-auto flex items-center h-9 pb-3',
          collapsed ? 'justify-center' : 'px-3'
        )}
      >
        <ThemeSwitch />
      </div>

      {/* Sign out */}
      <div className="pt-3 border-t border-divider/60">
        <Tooltip content="Sign out" placement="right" isDisabled={!collapsed}>
          <button
            onClick={handleSignOut}
            className={clsx(
              'group w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-danger-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-50/10 transition-colors whitespace-nowrap overflow-hidden text-left',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
            )}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && 'Sign Out'}
          </button>
        </Tooltip>
      </div>
    </nav>
  );
}

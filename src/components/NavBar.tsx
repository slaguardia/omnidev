'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Navbar as HeroUINavbar,
  NavbarContent,
  NavbarMenu,
  NavbarMenuToggle,
  NavbarBrand,
  NavbarItem,
  NavbarMenuItem,
} from '@heroui/navbar';
import { Kbd } from '@heroui/kbd';
import { Link } from '@heroui/link';
import { Button } from '@heroui/button';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useSession, signOut } from 'next-auth/react';

import { siteConfig } from '@/lib/config/site';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { GithubIcon, SearchIcon } from '@/components/Icons';
import { SearchModal } from '@/components/SearchModal';

/**
 * Check if showcase mode is enabled (read-only public mode)
 * In showcase mode, auth and dashboard are hidden
 */
function isShowcaseMode(): boolean {
  return process.env.NEXT_PUBLIC_SHOWCASE_MODE === 'true';
}

export const Navbar = () => {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const showcaseMode = isShowcaseMode();

  // Filter nav items based on showcase mode
  const navItems = useMemo(() => {
    if (showcaseMode) {
      // Hide Dashboard link in showcase mode
      return siteConfig.navItems.filter((item) => item.href !== '/dashboard');
    }
    return siteConfig.navItems;
  }, [showcaseMode]);

  // Prevent hydration mismatch by only rendering auth content after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle Command+K / Ctrl+K keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Check if a nav item is active
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/signin' });
  };

  const searchButton = (
    <button
      onClick={() => setIsSearchOpen(true)}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-content2/60 hover:bg-content2 border border-divider/60 transition-colors text-sm text-default-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <SearchIcon className="text-base text-default-400 flex-shrink-0" />
      <span>Search...</span>
      <Kbd className="hidden lg:inline-block" keys={['command']}>
        K
      </Kbd>
    </button>
  );

  return (
    <div className="fixed top-0 left-0 right-0 z-50 w-full border-b border-divider/60 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/55 shadow-sm shadow-black/5 dark:shadow-black/30">
      <HeroUINavbar
        maxWidth="xl"
        position="static"
        isBordered={false}
        classNames={{
          base: 'shadow-none border-0 bg-transparent px-4 sm:px-6',
        }}
      >
        <NavbarBrand className="gap-3 max-w-fit flex-shrink-0">
          <NextLink className="flex justify-start items-center gap-2" href="/">
            <p className="font-title font-semibold tracking-tight text-foreground text-xl">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-primary-400">
                {siteConfig.name}
              </span>
            </p>
          </NextLink>
        </NavbarBrand>

        {/* Centered nav tabs (desktop) */}
        <NavbarContent className="hidden lg:flex flex-1 justify-center" justify="center">
          <ul className="flex gap-2 justify-center">
            {navItems.map((item) => (
              <NavbarItem key={item.href} isActive={isActive(item.href)}>
                <NextLink
                  className={clsx(
                    'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 shadow-sm'
                      : 'text-default-600 hover:text-foreground hover:bg-content2/60'
                  )}
                  href={item.href}
                >
                  {item.label}
                </NextLink>
              </NavbarItem>
            ))}
          </ul>
        </NavbarContent>

        <NavbarContent className="hidden sm:flex flex-shrink-0" justify="end">
          <NavbarItem className="hidden sm:flex gap-2">
            <Link isExternal aria-label="Github" href={siteConfig.links.github}>
              <GithubIcon className="text-default-500" />
            </Link>
            <ThemeSwitch />
          </NavbarItem>
          <NavbarItem className="hidden lg:flex">{searchButton}</NavbarItem>

          {/* Authentication Section - hidden in showcase mode */}
          {!showcaseMode && (
            <NavbarItem className="hidden sm:flex items-center gap-6 ml-auto">
              {!mounted || status === 'loading' ? (
                <div className="w-20 h-8" />
              ) : session ? (
                <>
                  <span className="text-sm text-default-600 flex items-center">
                    {session.user?.name}
                  </span>
                  <Button size="sm" variant="flat" color="danger" onPress={handleSignOut}>
                    Sign Out
                  </Button>
                </>
              ) : (
                <Button as={NextLink} href="/signin" size="sm" variant="flat" color="primary">
                  Sign In
                </Button>
              )}
            </NavbarItem>
          )}
        </NavbarContent>

        <NavbarContent className="sm:hidden basis-1 pl-4" justify="end">
          <Link isExternal aria-label="Github" href={siteConfig.links.github}>
            <GithubIcon className="text-default-500" />
          </Link>
          <ThemeSwitch />
          <NavbarMenuToggle />
        </NavbarContent>

        <NavbarMenu>
          {searchButton}
          <div className="mx-4 mt-2 flex flex-col gap-2">
            {navItems.map((item) => (
              <NavbarMenuItem key={item.href}>
                <Link
                  as={NextLink}
                  className={clsx(
                    'w-full',
                    isActive(item.href) ? 'text-primary font-medium' : 'text-foreground'
                  )}
                  href={item.href}
                  size="lg"
                >
                  {item.label}
                </Link>
              </NavbarMenuItem>
            ))}
          </div>
          {/* Auth section - hidden in showcase mode */}
          {!showcaseMode && (
            <div className="mx-4 mt-4 pt-4 border-t border-divider">
              {!mounted || status === 'loading' ? (
                <div className="w-full h-10" />
              ) : session ? (
                <div className="flex flex-col gap-3">
                  <span className="text-sm text-default-600">
                    Signed in as {session.user?.name}
                  </span>
                  <Button fullWidth size="sm" variant="flat" color="danger" onPress={handleSignOut}>
                    Sign Out
                  </Button>
                </div>
              ) : (
                <Button
                  as={NextLink}
                  href="/signin"
                  fullWidth
                  size="sm"
                  variant="flat"
                  color="primary"
                >
                  Sign In
                </Button>
              )}
            </div>
          )}
        </NavbarMenu>
      </HeroUINavbar>

      <SearchModal isOpen={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </div>
  );
};

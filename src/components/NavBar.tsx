'use client';

import { useState, useEffect } from 'react';
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
import { link as linkStyles } from '@heroui/theme';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useSession, signOut } from 'next-auth/react';

import { siteConfig } from '@/lib/config/site';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { SearchIcon } from '@/components/Icons';
import { SearchModal } from '@/components/SearchModal';

export const Navbar = () => {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

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
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-default-100 hover:bg-default-200 transition-colors text-sm text-default-500"
    >
      <SearchIcon className="text-base text-default-400 flex-shrink-0" />
      <span>Search...</span>
      <Kbd className="hidden lg:inline-block" keys={['command']}>
        K
      </Kbd>
    </button>
  );

  return (
    <div className="fixed top-0 left-0 right-0 z-50 w-full border-b border-divider/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <HeroUINavbar
        maxWidth="xl"
        position="static"
        isBordered={false}
        classNames={{
          base: 'shadow-none border-0 bg-transparent px-4 sm:px-6 lg:px-8',
        }}
      >
        <NavbarContent className="basis-1/5 sm:basis-full" justify="start">
          <NavbarBrand as="li" className="gap-3 max-w-fit">
            <NextLink className="flex justify-start items-center gap-2" href="/">
              <div className="text-2xl">🕷️</div>
              <p className="font-bold text-inherit bg-gradient-to-r from-red-600 to-blue-800 bg-clip-text text-transparent">
                CodeSpider
              </p>
            </NextLink>
          </NavbarBrand>
          <ul className="hidden lg:flex gap-4 justify-start ml-2">
            {siteConfig.navItems.map((item) => (
              <NavbarItem key={item.href} isActive={isActive(item.href)}>
                <NextLink
                  className={clsx(
                    linkStyles({ color: 'foreground' }),
                    'transition-colors',
                    isActive(item.href)
                      ? 'text-primary font-medium'
                      : 'text-foreground hover:text-primary'
                  )}
                  href={item.href}
                >
                  {item.label}
                </NextLink>
              </NavbarItem>
            ))}
          </ul>
        </NavbarContent>

        <NavbarContent className="hidden sm:flex basis-1/5 sm:basis-full" justify="end">
          <NavbarItem className="hidden sm:flex gap-2">
            {/* <Link isExternal aria-label="Twitter" href={siteConfig.links.twitter}>
            <TwitterIcon className="text-default-500" />
          </Link>
          <Link isExternal aria-label="Discord" href={siteConfig.links.discord}>
            <DiscordIcon className="text-default-500" />
          </Link>
          <Link isExternal aria-label="Github" href={siteConfig.links.github}>
            <GithubIcon className="text-default-500" />
          </Link> */}
            <ThemeSwitch />
          </NavbarItem>
          <NavbarItem className="hidden lg:flex">{searchButton}</NavbarItem>

          {/* Authentication Section - only render after mount to avoid hydration mismatch */}
          <NavbarItem className="hidden sm:flex items-center gap-6 ml-auto">
            {!mounted || status === 'loading' ? (
              <div className="w-20 h-8" />
            ) : session ? (
              <>
                <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center">
                  {session.user?.name}
                </span>
                <Button size="sm" variant="flat" color="danger" onPress={handleSignOut}>
                  Sign Out
                </Button>
              </>
            ) : (
              <Button as={NextLink} href="/signin" size="sm" variant="flat">
                Sign In
              </Button>
            )}
          </NavbarItem>
        </NavbarContent>

        <NavbarContent className="sm:hidden basis-1 pl-4" justify="end">
          {/* <Link isExternal aria-label="Github" href={siteConfig.links.github}>
          <GithubIcon className="text-default-500" />
        </Link> */}
          <ThemeSwitch />
          <NavbarMenuToggle />
        </NavbarContent>

        <NavbarMenu>
          {searchButton}
          <div className="mx-4 mt-2 flex flex-col gap-2">
            {siteConfig.navMenuItems.map((item, index) => (
              <NavbarMenuItem key={`${item}-${index}`}>
                <Link
                  color={
                    index === 2
                      ? 'primary'
                      : index === siteConfig.navMenuItems.length - 1
                        ? 'danger'
                        : 'foreground'
                  }
                  href="#"
                  size="lg"
                >
                  {item.label}
                </Link>
              </NavbarMenuItem>
            ))}
          </div>
        </NavbarMenu>
      </HeroUINavbar>

      <SearchModal isOpen={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </div>
  );
};

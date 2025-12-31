export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: 'Omnidev',
  description: 'Agentic workflow automation for git repositories',
  navItems: [
    {
      label: 'Docs',
      href: '/docs/quickstart',
    },
    {
      label: 'Dashboard',
      href: '/dashboard',
    },
    {
      label: 'About',
      href: '/about',
    },
  ],
  navMenuItems: [
    {
      label: 'Dashboard',
      href: '/dashboard',
    },
    {
      label: 'Workspaces',
      href: '/workspaces',
    },
    {
      label: 'Analytics',
      href: '/analytics',
    },
    {
      label: 'Settings',
      href: '/settings',
    },
    {
      label: 'Help & Feedback',
      href: '/help-feedback',
    },
    {
      label: 'Logout',
      href: '/logout',
    },
  ],
  links: {
    github: 'https://github.com/slaguardia/omnidev',
    twitter: 'https://twitter.com/omnidev',
    docs: 'https://docs.omnidev.cloud',
    discord: 'https://discord.gg/omnidev',
    sponsor: 'https://patreon.com/omnidev',
  },
};

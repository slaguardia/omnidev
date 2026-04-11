export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: 'Omnidev',
  description:
    'Self-hosted AI developer bot for git repositories. Queue code tasks from anywhere, wake up to merge requests. Uses your own Claude Code subscription.',
  shortDescription: 'Self-hosted AI developer bot for automated code changes',
  keywords: [
    // Primary keywords - high intent
    'developer automation',
    'AI code assistant',
    'git workflow automation',
    'self-hosted AI developer tools',
    'Claude Code integration',
    // Secondary keywords - product features
    'async job queue',
    'merge request automation',
    'pull request automation',
    'automated code changes',
    'AI-powered code analysis',
    // Platform integrations
    'GitLab integration',
    'GitHub automation',
    'n8n integration',
    'CI/CD automation',
    // Use case keywords
    'developer productivity',
    'workflow orchestration',
    'repository management',
    'bot orchestration runtime',
    'remote code editing',
    // Differentiator keywords
    'bring your own AI',
    'self-hosted developer bot',
    'open source AI coding',
  ],
  url: 'https://omnidev.cloud',
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

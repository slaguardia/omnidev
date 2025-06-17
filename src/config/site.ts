export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "CodeSpider",
  description: "Intelligent code analysis and workflow management powered by AI",
  navItems: [
    {
      label: "Home",
      href: "/",
    },
    {
      label: "Docs",
      href: "/docs",
    },
    {
      label: "Dashboard",
      href: "/dashboard",
    },
    {
      label: "About",
      href: "/about",
    },
  ],
  navMenuItems: [
    {
      label: "Dashboard",
      href: "/dashboard",
    },
    {
      label: "Workspaces",
      href: "/workspaces",
    },
    {
      label: "Analytics",
      href: "/analytics",
    },
    {
      label: "Settings",
      href: "/settings",
    },
    {
      label: "Help & Feedback",
      href: "/help-feedback",
    },
    {
      label: "Logout",
      href: "/logout",
    },
  ],
  links: {
    github: "https://github.com/yourusername/codespider",
    twitter: "https://twitter.com/codespider",
    docs: "https://docs.codespider.dev",
    discord: "https://discord.gg/codespider",
    sponsor: "https://patreon.com/codespider",
  },
};

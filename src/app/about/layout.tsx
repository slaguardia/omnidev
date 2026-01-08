import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Learn about Omnidev, a self-hosted AI developer bot for automating code tasks. Queue changes from your phone, integrate with GitLab and GitHub, and maximize your Claude Code subscription.',
  openGraph: {
    title: 'About Omnidev - Self-Hosted AI Developer Automation',
    description:
      'A self-hosted platform for AI-assisted code analysis and editing. Automate merge requests, pull requests, and code changes using Claude Code CLI.',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <section className="w-full">{children}</section>;
}

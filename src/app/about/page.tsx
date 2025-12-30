'use client';

import { title, subtitle } from '@/components/Primitives';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Chip } from '@heroui/chip';
import { Divider } from '@heroui/divider';
import { Link } from '@heroui/link';
import { FadeIn, ScrollReveal, ScrollRevealScale } from '@/components/motion';

export default function AboutPage() {
  return (
    <div className="container mx-auto max-w-7xl px-6 py-12">
      {/* Hero Section */}
      <FadeIn>
        <header className="text-center mb-16">
          <h1 className={title({ size: 'lg', class: 'mb-4' })}>About CodeSpider</h1>
          <p className={subtitle({ class: 'max-w-2xl mx-auto' })}>
            A self-hosted platform for AI-assisted code analysis and editing, powered by Claude Code
            CLI
          </p>
        </header>
      </FadeIn>

      {/* Purpose Section */}
      <ScrollReveal>
        <section className="mb-16">
          <Card className="glass-card-static">
            <CardBody className="p-8 md:p-10">
              <h2 className="text-2xl font-bold mb-6">Why CodeSpider?</h2>
              <div className="space-y-6 text-default-700">
                <p className="text-lg">
                  CodeSpider turns your Claude subscription into a 24/7 development assistant. Queue
                  up code changes from your phone, triage your backlog while commuting, and wake up
                  to merge requests ready for review.
                </p>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-8">
                  <div className="glass-card p-5">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                      <svg
                        className="w-5 h-5 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">Work While You Sleep</h3>
                    <p className="text-sm">
                      Assign issues to CodeSpider from your phone and let it work overnight. Come
                      back to branches with completed changes and merge requests waiting for your
                      review.
                    </p>
                  </div>

                  <div className="glass-card p-5">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                      <svg
                        className="w-5 h-5 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                        />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">Faster Backlog Triage</h3>
                    <p className="text-sm">
                      Quickly analyze issues, estimate complexity, and plan features with AI
                      assistance. Turn a mountain of backlog items into actionable, well-scoped
                      tasks.
                    </p>
                  </div>

                  <div className="glass-card p-5">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                      <svg
                        className="w-5 h-5 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                        />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">
                      Maximize Your Subscription
                    </h3>
                    <p className="text-sm">
                      Get more value from your Claude subscription by running it continuously on
                      real work. No more idle time between coding sessions.
                    </p>
                  </div>

                  <div className="glass-card p-5">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                      <svg
                        className="w-5 h-5 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                        />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">Access From Anywhere</h3>
                    <p className="text-sm">
                      Web-based interface means no CLI setup required. Queue tasks from your phone,
                      tablet, or any browser while away from your development machine.
                    </p>
                  </div>

                  <div className="glass-card p-5">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                      <svg
                        className="w-5 h-5 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                        />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">GitLab Integration</h3>
                    <p className="text-sm">
                      Automatic branch creation, commits, and merge requests with AI-generated
                      descriptions. Review and merge when you&apos;re ready.
                    </p>
                  </div>

                  <div className="glass-card p-5">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                      <svg
                        className="w-5 h-5 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">Secure & Self-Hosted</h3>
                    <p className="text-sm">
                      Run on your own infrastructure with sandboxed execution. Your code never
                      leaves your network. 2FA, API keys, and IP whitelisting included.
                    </p>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </section>
      </ScrollReveal>

      <Divider className="my-12" />

      {/* Target Audience */}
      <ScrollReveal>
        <section className="mb-16">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="glass-card !border-l-4 !border-l-success">
              <CardHeader className="pb-2">
                <h3 className="font-semibold text-lg">Who This Is For</h3>
              </CardHeader>
              <CardBody className="pt-0">
                <ul className="space-y-2 text-default-600 text-sm">
                  <li>Teams using GitLab for source control</li>
                  <li>Organizations wanting web-based AI code assistance</li>
                  <li>Environments where Docker deployment is acceptable</li>
                  <li>Developers who want async, queue-based AI task execution</li>
                  <li>Users with their own Claude subscription</li>
                </ul>
              </CardBody>
            </Card>

            <Card className="glass-card !border-l-4 !border-l-warning">
              <CardHeader className="pb-2">
                <h3 className="font-semibold text-lg">Who Should Look Elsewhere</h3>
              </CardHeader>
              <CardBody className="pt-0">
                <ul className="space-y-2 text-default-600 text-sm">
                  <li>GitHub-only workflows (GitLab integration is primary)</li>
                  <li>Users needing real-time collaborative editing</li>
                  <li>Environments requiring serverless deployment</li>
                  <li>Those expecting a hosted/managed service</li>
                </ul>
              </CardBody>
            </Card>
          </div>
        </section>
      </ScrollReveal>

      <Divider className="my-12" />

      {/* Claude Code Disclosure */}
      <ScrollReveal>
        <section className="mb-16">
          <Card className="glass-card-static bg-content2/50">
            <CardBody className="p-6">
              <h3 className="font-semibold text-lg mb-3">Claude Code Dependency</h3>
              <p className="text-default-600 text-sm leading-relaxed">
                This project installs and orchestrates the publicly available Claude Code package.
                Users must have their own Claude account and active subscription to use this tool.
                Claude Code is a product of Anthropic PBC and is not affiliated with this project.
              </p>
            </CardBody>
          </Card>
        </section>
      </ScrollReveal>

      <Divider className="my-12" />

      {/* Key Features */}
      <ScrollReveal>
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Key Features</h2>
          <p className="text-default-500 mb-8">
            Everything you need for AI-powered code operations in one platform.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="glass-card">
              <CardHeader className="pb-0 pt-5 px-5 flex-col items-start">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold text-lg">Workspace Management</h3>
              </CardHeader>
              <CardBody className="pt-2 px-5 pb-5">
                <p className="text-default-500 text-sm">
                  Clone and manage multiple Git repositories from a central dashboard. Switch
                  branches, view file trees, and organize workspaces with ease.
                </p>
              </CardBody>
            </Card>

            <Card className="glass-card">
              <CardHeader className="pb-0 pt-5 px-5 flex-col items-start">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold text-lg">Claude Code + MCP Integration</h3>
              </CardHeader>
              <CardBody className="pt-2 px-5 pb-5">
                <p className="text-default-500 text-sm">
                  Ask questions or request AI-assisted edits with full codebase context. Connect to
                  external MCP servers (Linear, GitHub, Slack) to extend Claude&apos;s capabilities.
                </p>
              </CardBody>
            </Card>

            <Card className="glass-card">
              <CardHeader className="pb-0 pt-5 px-5 flex-col items-start">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold text-lg">GitLab Integration</h3>
              </CardHeader>
              <CardBody className="pt-2 px-5 pb-5">
                <p className="text-default-500 text-sm">
                  Seamlessly create merge requests with AI-generated descriptions. Automatic branch
                  creation, commit management, and MR workflows built in.
                </p>
              </CardBody>
            </Card>

            <Card className="glass-card">
              <CardHeader className="pb-0 pt-5 px-5 flex-col items-start">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold text-lg">Security First</h3>
              </CardHeader>
              <CardBody className="pt-2 px-5 pb-5">
                <p className="text-default-500 text-sm">
                  Two-factor authentication, API key management, IP whitelisting, and sandboxed
                  execution ensure your code and credentials stay protected.
                </p>
              </CardBody>
            </Card>
          </div>
        </section>
      </ScrollReveal>

      <Divider className="my-12" />

      {/* Tech Stack */}
      <ScrollReveal>
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Technology Stack</h2>
          <p className="text-default-500 mb-6">Built with modern, well-supported technologies.</p>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-default-400 uppercase tracking-wider mb-3">
                Frontend
              </h3>
              <div className="flex flex-wrap gap-2">
                <Chip variant="flat" color="primary" size="sm">
                  Next.js 15
                </Chip>
                <Chip variant="flat" color="primary" size="sm">
                  TypeScript
                </Chip>
                <Chip variant="flat" color="primary" size="sm">
                  HeroUI
                </Chip>
                <Chip variant="flat" color="primary" size="sm">
                  Tailwind CSS
                </Chip>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-default-400 uppercase tracking-wider mb-3">
                Backend & Infrastructure
              </h3>
              <div className="flex flex-wrap gap-2">
                <Chip variant="flat" color="secondary" size="sm">
                  NextAuth.js
                </Chip>
                <Chip variant="flat" color="secondary" size="sm">
                  simple-git
                </Chip>
                <Chip variant="flat" color="secondary" size="sm">
                  GitLab API
                </Chip>
                <Chip variant="flat" color="secondary" size="sm">
                  Docker
                </Chip>
                <Chip variant="flat" color="secondary" size="sm">
                  Zod
                </Chip>
              </div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      <Divider className="my-12" />

      {/* Roadmap */}
      <ScrollReveal>
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-2">Development Roadmap</h2>
          <p className="text-default-500 mb-8">
            Development progress and planned features.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Completed */}
            <ScrollRevealScale>
              <Card className="glass-card !border-l-4 !border-l-success">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-success" />
                    <h3 className="font-semibold text-success">Completed</h3>
                  </div>
                </CardHeader>
                <CardBody className="pt-0">
                  <ul className="space-y-2 text-default-600 text-sm">
                    <li>TypeScript with strict mode</li>
                    <li>Next.js App Router UI</li>
                    <li>Workspace management</li>
                    <li>Claude Code CLI integration</li>
                    <li>REST API endpoints</li>
                    <li>GitLab merge requests</li>
                    <li>2FA authentication</li>
                    <li>Async job queue</li>
                    <li>Docker sandboxing</li>
                    <li>Documentation system</li>
                  </ul>
                </CardBody>
              </Card>
            </ScrollRevealScale>

            {/* In Progress */}
            <ScrollRevealScale>
              <Card className="glass-card !border-l-4 !border-l-warning">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                    <h3 className="font-semibold text-warning">In Progress</h3>
                  </div>
                </CardHeader>
                <CardBody className="pt-0">
                  <ul className="space-y-2 text-default-600 text-sm">
                    <li>MCP server proxy infrastructure</li>
                    <li>Remote MCP server support (token-based)</li>
                    <li>Enhanced execution history</li>
                    <li>Performance optimizations</li>
                  </ul>
                </CardBody>
              </Card>
            </ScrollRevealScale>

            {/* Planned */}
            <ScrollRevealScale>
              <Card className="glass-card !border-l-4 !border-l-default-400">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-default-400" />
                    <h3 className="font-semibold text-default-500">Planned</h3>
                  </div>
                </CardHeader>
                <CardBody className="pt-0">
                  <ul className="space-y-2 text-default-600 text-sm">
                    <li>OAuth-based MCP server support</li>
                    <li>MCP connections dashboard</li>
                    <li>GitHub integration</li>
                    <li>Multi-user teams</li>
                  </ul>
                </CardBody>
              </Card>
            </ScrollRevealScale>
          </div>
        </section>
      </ScrollReveal>

      {/* Documentation Link */}
      <ScrollReveal>
        <section className="text-center py-8">
          <Link
            href="/docs/quickstart"
            className="inline-flex items-center gap-2 text-lg font-medium text-primary hover:underline transition-all hover:gap-3"
          >
            Read our documentation
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Link>
        </section>
      </ScrollReveal>
    </div>
  );
}

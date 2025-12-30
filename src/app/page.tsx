'use client';

import { Link } from '@heroui/link';
import { Button } from '@heroui/button';
import { Zap, BookOpen, Clock, Plug, ListChecks } from 'lucide-react';

import { title, subtitle } from '@/components/Primitives';
import { FadeIn, FadeInUp, StaggerContainer, StaggerItem } from '@/components/motion';

export default function Home() {
  return (
    <div className="container mx-auto max-w-7xl px-6 pt-8 flex flex-col min-h-full relative">
      {/* Enhanced spider web background */}
      <div className="fixed inset-0 web-animate pointer-events-none">
        <svg width="100%" height="100%" className="absolute inset-0">
          <defs>
            <pattern id="web" width="200" height="200" patternUnits="userSpaceOnUse">
              {/* Main web structure - enhanced visibility */}
              <path
                d="M0 100 L100 0 L200 100 L100 200 Z"
                stroke="currentColor"
                strokeWidth="0.6"
                fill="none"
                opacity="0.8"
              />
              <path
                d="M50 50 L150 50 L150 150 L50 150 Z"
                stroke="currentColor"
                strokeWidth="0.4"
                fill="none"
                opacity="0.6"
              />

              {/* Spider web radial lines - more prominent */}
              <path
                d="M100 0 L100 200 M0 100 L200 100"
                stroke="currentColor"
                strokeWidth="0.4"
                opacity="0.5"
              />
              <path
                d="M25 25 L175 175 M175 25 L25 175"
                stroke="currentColor"
                strokeWidth="0.3"
                opacity="0.4"
              />

              {/* Connection points (dewdrops) - larger and more visible */}
              <circle cx="100" cy="100" r="2" fill="currentColor" opacity="0.7">
                <animate
                  attributeName="opacity"
                  values="0.7;1;0.7"
                  dur="3s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx="50" cy="50" r="1" fill="currentColor" opacity="0.5">
                <animate
                  attributeName="opacity"
                  values="0.5;0.8;0.5"
                  dur="4s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx="150" cy="150" r="1" fill="currentColor" opacity="0.5">
                <animate
                  attributeName="opacity"
                  values="0.5;0.8;0.5"
                  dur="3.5s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx="150" cy="50" r="1" fill="currentColor" opacity="0.5">
                <animate
                  attributeName="opacity"
                  values="0.5;0.8;0.5"
                  dur="4.5s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx="50" cy="150" r="1" fill="currentColor" opacity="0.5">
                <animate
                  attributeName="opacity"
                  values="0.5;0.8;0.5"
                  dur="3.8s"
                  repeatCount="indefinite"
                />
              </circle>

              {/* Subtle threading - enhanced */}
              <path
                d="M25 100 Q100 75 175 100 Q100 125 25 100"
                stroke="currentColor"
                strokeWidth="0.2"
                fill="none"
                opacity="0.3"
              />
              <path
                d="M100 25 Q125 100 100 175 Q75 100 100 25"
                stroke="currentColor"
                strokeWidth="0.2"
                fill="none"
                opacity="0.3"
              />

              {/* Additional web strands for more complexity */}
              <path
                d="M0 50 L50 0 M150 0 L200 50 M200 150 L150 200 M50 200 L0 150"
                stroke="currentColor"
                strokeWidth="0.25"
                opacity="0.35"
              />
            </pattern>

            {/* Subtle glow effect */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="1" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="url(#web)"
            filter="url(#glow)"
            className="text-primary/15 dark:text-primary/20"
          />
        </svg>
      </div>

      {/* Main Landing Content */}
      <section className="flex flex-col items-center justify-center py-12 md:py-16 text-center relative px-6">
        <div className="relative z-10 max-w-4xl mx-auto">
          <FadeIn delay={0.1}>
            <div className="flex items-center justify-center gap-3 mb-8">
              <span className="px-4 py-2 bg-content2/60 border border-divider/60 rounded-full text-sm font-medium text-default-700 dark:text-default-200 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Using{' '}
                <span className="font-semibold text-primary">Claude Code</span>{' '}
                <Zap className="w-4 h-4" />
              </span>
            </div>
          </FadeIn>

          <FadeInUp delay={0.2}>
            <h1 className="mb-8">
              <span className={title({ size: 'lg' })}>Welcome to&nbsp;</span>
              <span
                className={
                  title({ size: 'lg' }) +
                  ' bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-primary-400'
                }
              >
                CodeSpider
              </span>
            </h1>
          </FadeInUp>

          <FadeInUp delay={0.3}>
            <div className={subtitle({ class: 'mb-12 max-w-2xl mx-auto' })}>
              Turn your Claude subscription into a 24/7 development assistant. Queue tasks from your
              phone, wake up to merge requests.
            </div>
          </FadeInUp>

          <FadeInUp delay={0.4}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                as={Link}
                href="/dashboard"
                size="lg"
                color="primary"
                variant="shadow"
                className="font-semibold px-7 hover:scale-[1.02] transition-transform flex items-center gap-2"
              >
                Get Started
              </Button>
              <Button
                as={Link}
                href="/docs/quickstart"
                size="lg"
                variant="bordered"
                className="border-divider/70 text-foreground font-semibold px-7 hover:bg-content2/60 hover:scale-[1.02] transition-transform flex items-center gap-2"
              >
                Learn More <BookOpen className="w-4 h-4" />
              </Button>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* Feature highlights with better spacing */}
      <section className="py-12 px-6 relative">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-8" delay={0.5}>
            <StaggerItem className="group p-8 glass-card">
              <div className="text-4xl mb-6 transition-transform duration-300 group-hover:scale-110 flex justify-center">
                <Clock className="w-12 h-12 text-primary" />
              </div>
              <h3 className="font-bold text-xl mb-4 text-foreground">Async Job Queue</h3>
              <p className="text-default-600 text-sm leading-relaxed">
                Queue code changes and let them run in the background. Check back when it&apos;s
                done, or get notified via webhook.
              </p>
            </StaggerItem>

            <StaggerItem className="group p-8 glass-card">
              <div className="text-4xl mb-6 transition-transform duration-300 group-hover:scale-110 flex justify-center">
                <Plug className="w-12 h-12 text-primary" />
              </div>
              <h3 className="font-bold text-xl mb-4 text-foreground">API-First Design</h3>
              <p className="text-default-600 text-sm leading-relaxed">
                REST endpoints for everything. Integrate with n8n, CI/CD pipelines, or build your
                own automations.
              </p>
            </StaggerItem>

            <StaggerItem className="group p-8 glass-card">
              <div className="text-4xl mb-6 transition-transform duration-300 group-hover:scale-110 flex justify-center">
                <ListChecks className="w-12 h-12 text-primary" />
              </div>
              <h3 className="font-bold text-xl mb-4 text-foreground">Faster Backlog Triage</h3>
              <p className="text-default-600 text-sm leading-relaxed">
                Analyze issues, estimate complexity, and plan features with AI assistance. Turn your
                backlog into actionable tasks.
              </p>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>
    </div>
  );
}

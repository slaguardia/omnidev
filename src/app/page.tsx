import { Link } from '@heroui/link';
import { Button } from '@heroui/button';
import { Zap, BookOpen, Search, GitBranch, Brain } from 'lucide-react';

import { title, subtitle } from '@/components/Primitives';

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
            className="text-red-500/20 dark:text-red-400/30"
          />
        </svg>
      </div>

      {/* Main Landing Content */}
      <section className="flex flex-col items-center justify-center py-12 md:py-16 text-center relative px-6">
        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-8">
            <span className="px-4 py-2 bg-gradient-to-r from-red-500/20 to-red-600/20 border border-red-300/30 rounded-full text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Powered by{' '}
              <span className="font-semibold text-blue-600 dark:text-blue-400">Claude Code</span>{' '}
              <Zap className="w-4 h-4" />
            </span>
          </div>

          <h1 className="mb-8">
            <span className={title({ size: 'lg' })}>Welcome to&nbsp;</span>
            <span
              className={title({ size: 'lg' })}
              style={{
                background: 'linear-gradient(to right, #dc2626, #1e40af)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Code
            </span>
            <span
              className={title({ size: 'lg' })}
              style={{
                background: 'linear-gradient(to right, #1e40af, #dc2626)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Spider
            </span>
          </h1>

          <div className={subtitle({ class: 'mb-12 max-w-2xl mx-auto' })}>
            Eats your{' '}
            <code className="px-2 py-1 bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 rounded font-mono text-sm border border-red-200 dark:border-red-800">{`//BUGs`}</code>{' '}
            and asynchronously attacks your backlog.
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              as={Link}
              href="/dashboard"
              size="lg"
              color="primary"
              variant="shadow"
              className="bg-gradient-to-r from-red-600 to-red-700 font-semibold px-6 text-white hover:scale-105 transition-transform flex items-center gap-2"
            >
              Get Started
            </Button>
            <Button
              as={Link}
              href="/docs"
              size="lg"
              variant="bordered"
              className="border-red-300 text-red-600 dark:border-red-400 dark:text-red-400 font-semibold px-6 hover:bg-red-50 dark:hover:bg-red-950/20 hover:scale-105 transition-transform flex items-center gap-2"
            >
              Learn More <BookOpen className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Feature highlights with better spacing */}
      <section className="py-12 px-6 relative">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="group p-8 bg-background/60 backdrop-blur-sm border border-default-200/50 dark:border-default-700/50 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-red-300/50 dark:hover:border-red-400/50 hover:bg-background/80">
              <div className="text-4xl mb-6 transition-transform duration-300 group-hover:scale-110 flex justify-center">
                <Search className="w-12 h-12 text-red-500" />
              </div>
              <h3 className="font-bold text-xl mb-4 text-red-700 dark:text-red-300">AI Analysis</h3>
              <p className="text-default-600 text-sm leading-relaxed">
                Let Claude understand your codebase structure and provide intelligent insights
              </p>
            </div>

            <div className="group p-8 bg-background/60 backdrop-blur-sm border border-default-200/50 dark:border-default-700/50 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-blue-300/50 dark:hover:border-blue-400/50 hover:bg-background/80">
              <div className="text-4xl mb-6 transition-transform duration-300 group-hover:scale-110 flex justify-center">
                <Brain className="w-12 h-12 text-blue-500" />
              </div>
              <h3 className="font-bold text-xl mb-4 text-blue-700 dark:text-blue-300">
                Intelligent Caching
              </h3>
              <p className="text-default-600 text-sm leading-relaxed">
                For optimal performance and blazing-fast development workflows
              </p>
            </div>

            <div className="group p-8 bg-background/60 backdrop-blur-sm border border-default-200/50 dark:border-default-700/50 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-orange-300/50 dark:hover:border-orange-400/50 hover:bg-background/80">
              <div className="text-4xl mb-6 transition-transform duration-300 group-hover:scale-110 flex justify-center">
                <GitBranch className="w-12 h-12 text-orange-500" />
              </div>
              <h3 className="font-bold text-xl mb-4 text-orange-700 dark:text-orange-300">
                Repository Management
              </h3>
              <p className="text-default-600 text-sm leading-relaxed">
                Seamlessly clone, sync, and manage repositories from various platforms
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

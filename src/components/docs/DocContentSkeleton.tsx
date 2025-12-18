'use client';

import { Skeleton } from '@heroui/skeleton';

const NAVBAR_HEIGHT = '4rem';

export function DocContentSkeleton() {
  return (
    <>
      {/* Main Content Skeleton - Column 2 */}
      <main className="min-w-0">
        <div className="sticky top-16">
          <div
            className="scrollbar-hide"
            style={{ height: `calc(100vh - ${NAVBAR_HEIGHT})`, overflowY: 'auto' }}
          >
            <article className="h-full">
              <div className="px-6 py-4">
                <div className="mx-auto max-w-3xl pb-20">
                  {/* Header Skeleton */}
                  <header className="mb-10 border-b border-divider pb-8">
                    <Skeleton className="mb-4 h-12 w-3/4 rounded-lg lg:h-14" />
                    <Skeleton className="h-6 w-2/3 rounded-lg" />
                  </header>

                  {/* Content Skeleton - Mimics article structure */}
                  <div className="mb-12 space-y-8">
                    {/* First section */}
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-1/3 rounded-lg" />
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-full rounded-md" />
                        <Skeleton className="h-4 w-full rounded-md" />
                        <Skeleton className="h-4 w-5/6 rounded-md" />
                      </div>
                    </div>

                    {/* Code block skeleton */}
                    <div className="rounded-xl bg-default-100/50 p-4">
                      <Skeleton className="mb-3 h-4 w-1/4 rounded-md" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-3/4 rounded-md" />
                        <Skeleton className="h-4 w-1/2 rounded-md" />
                        <Skeleton className="h-4 w-2/3 rounded-md" />
                      </div>
                    </div>

                    {/* Second section */}
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-2/5 rounded-lg" />
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-full rounded-md" />
                        <Skeleton className="h-4 w-full rounded-md" />
                        <Skeleton className="h-4 w-4/5 rounded-md" />
                        <Skeleton className="h-4 w-full rounded-md" />
                      </div>
                    </div>

                    {/* List skeleton */}
                    <div className="space-y-3 pl-4">
                      <div className="flex items-start gap-3">
                        <Skeleton className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" />
                        <Skeleton className="h-4 w-3/4 rounded-md" />
                      </div>
                      <div className="flex items-start gap-3">
                        <Skeleton className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" />
                        <Skeleton className="h-4 w-2/3 rounded-md" />
                      </div>
                      <div className="flex items-start gap-3">
                        <Skeleton className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" />
                        <Skeleton className="h-4 w-4/5 rounded-md" />
                      </div>
                    </div>

                    {/* Third section */}
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-1/4 rounded-lg" />
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-full rounded-md" />
                        <Skeleton className="h-4 w-5/6 rounded-md" />
                      </div>
                    </div>

                    {/* Table skeleton */}
                    <div className="overflow-hidden rounded-xl border border-divider">
                      <div className="border-b border-divider bg-default-100/50 px-4 py-3">
                        <div className="flex gap-8">
                          <Skeleton className="h-4 w-24 rounded-md" />
                          <Skeleton className="h-4 w-32 rounded-md" />
                          <Skeleton className="h-4 w-20 rounded-md" />
                        </div>
                      </div>
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="border-b border-divider px-4 py-3 last:border-b-0">
                          <div className="flex gap-8">
                            <Skeleton className="h-4 w-24 rounded-md" />
                            <Skeleton className="h-4 w-32 rounded-md" />
                            <Skeleton className="h-4 w-20 rounded-md" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Navigation Footer Skeleton */}
                  <nav className="mt-12 border-t border-divider pt-8">
                    <div className="flex items-center justify-between gap-4">
                      <Skeleton className="h-14 w-36 rounded-xl" />
                      <Skeleton className="h-14 w-36 rounded-xl" />
                    </div>
                  </nav>
                </div>
              </div>
            </article>
          </div>
        </div>
      </main>

      {/* Right Sidebar - Table of Contents Skeleton (Column 3) */}
      <aside className="hidden xl:block">
        <div className="sticky top-16">
          <div
            className="scrollbar-hide pt-4 pl-2"
            style={{ maxHeight: `calc(100vh - ${NAVBAR_HEIGHT})`, overflowY: 'auto' }}
          >
            <div className="space-y-4">
              <Skeleton className="h-5 w-32 rounded-md" />
              <div className="space-y-3 pl-2">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-4 w-36 rounded-md" />
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-4 w-20 rounded-md" />
                <Skeleton className="h-4 w-28 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

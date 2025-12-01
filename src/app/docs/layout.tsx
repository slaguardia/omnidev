import { DocsNavigation } from '@/components/docs/DocsNavigation';

const NAVBAR_HEIGHT = '4rem';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left Sidebar - Sticky */}
        <aside className="hidden lg:block">
          <div className="sticky top-16">
            <div
              className="scrollbar-hide pr-2 pt-4"
              style={{ maxHeight: `calc(100vh - ${NAVBAR_HEIGHT})`, overflowY: 'auto' }}
            >
              <DocsNavigation />
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="min-w-0">
          <div className="sticky top-16">
            <div
              data-docs-content
              className="scrollbar-hide"
              style={{ height: `calc(100vh - ${NAVBAR_HEIGHT})`, overflowY: 'auto' }}
            >
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

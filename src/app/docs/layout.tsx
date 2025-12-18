import { DocsNavigation } from '@/components/docs/DocsNavigation';

const NAVBAR_HEIGHT = '4rem';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1800px] pl-2 pr-4 sm:pl-3 sm:pr-6 lg:pl-4 lg:pr-8">
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_260px] 2xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        {/* Left Sidebar - Docs Navigation (all the way left) */}
        <aside className="hidden lg:block">
          <div className="sticky top-16">
            <div
              className="scrollbar-hide pt-4"
              style={{ maxHeight: `calc(100vh - ${NAVBAR_HEIGHT})`, overflowY: 'auto' }}
            >
              <DocsNavigation />
            </div>
          </div>
        </aside>

        {/* Main Content + Right Sidebar - rendered by DocContent */}
        {children}
      </div>
    </div>
  );
}

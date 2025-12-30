import { DocsNavigation } from '@/components/docs/DocsNavigation';
import { MobileDocsNavigation } from '@/components/docs/MobileDocsNavigation';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1800px] pl-2 pr-4 sm:pl-3 sm:pr-6 lg:pl-4 lg:pr-8">
      {/* Mobile Navigation - only visible on small screens */}
      <div className="pt-4">
        <MobileDocsNavigation />
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_260px] 2xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        {/* Left Sidebar - Docs Navigation (all the way left) */}
        <aside className="hidden lg:block">
          <div className="sticky top-16 pt-4">
            <DocsNavigation />
          </div>
        </aside>

        {/* Main Content + Right Sidebar - rendered by DocContent */}
        {children}
      </div>
    </div>
  );
}

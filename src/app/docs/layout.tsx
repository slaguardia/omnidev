import { DocsNavigation } from '@/components/docs/DocsNavigation';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full min-h-full">
      {/* Left Sidebar - Navigation (sticky) */}
      <aside className="hidden lg:block lg:w-64 xl:w-72 flex-shrink-0 border-r border-divider bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="py-8 px-6">
            <DocsNavigation />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

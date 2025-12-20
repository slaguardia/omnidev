import { notFound } from 'next/navigation';
import { getDocContent, extractHeadings } from '@/lib/docs/markdown';
import { getAdjacentDocs } from '@/lib/docs/config';
import { MarkdownRenderer } from '@/components/docs/MarkdownRenderer';
import { TableOfContents } from '@/components/docs/TableOfContents';
import { DocContentWrapper } from '@/components/docs/DocContentWrapper';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DocContentProps {
  slug: string;
}

const NAVBAR_HEIGHT = '4rem';

export async function DocContent({ slug }: DocContentProps) {
  const doc = await getDocContent(slug);

  if (!doc) {
    notFound();
  }

  const headings = extractHeadings(doc.content);
  const { prev, next } = getAdjacentDocs(slug);

  const hasToc = headings.length > 0;

  return (
    <DocContentWrapper>
      {/* Main Content - Column 2 */}
      <main className="min-w-0">
        <div className="sticky top-16">
          <div
            data-docs-content
            className="scrollbar-hide"
            style={{ height: `calc(100vh - ${NAVBAR_HEIGHT})`, overflowY: 'auto' }}
          >
            <article className="h-full">
              <div className="px-6 py-4">
                <div className="mx-auto max-w-3xl pb-20">
                  {/* Header */}
                  <header className="mb-10 border-b border-divider pb-8">
                    <h1 className="mb-4 text-4xl font-bold tracking-tight lg:text-5xl">
                      {doc.title}
                    </h1>
                    {doc.description && (
                      <p className="text-lg text-default-600">{doc.description}</p>
                    )}
                  </header>

                  {/* Markdown Content */}
                  <div className="mb-12">
                    <MarkdownRenderer content={doc.content} />
                  </div>

                  {/* Navigation Footer */}
                  <nav className="mt-12 border-t border-divider pt-8">
                    <div className="flex items-center justify-between gap-4">
                      {prev ? (
                        <Link
                          href={`/docs/${prev.slug}`}
                          className="group flex items-center gap-2 py-4 text-default-600 hover:text-primary transition-colors"
                        >
                          <ChevronLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
                          <span className="flex flex-col items-start">
                            <span className="text-xs text-default-500 group-hover:text-primary/70">
                              Previous
                            </span>
                            <span className="font-medium">{prev.title}</span>
                          </span>
                        </Link>
                      ) : (
                        <div />
                      )}

                      {next ? (
                        <Link
                          href={`/docs/${next.slug}`}
                          className="group flex items-center gap-2 py-4 text-default-600 hover:text-primary transition-colors"
                        >
                          <span className="flex flex-col items-end">
                            <span className="text-xs text-default-500 group-hover:text-primary/70">
                              Next
                            </span>
                            <span className="font-medium">{next.title}</span>
                          </span>
                          <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                        </Link>
                      ) : (
                        <div />
                      )}
                    </div>
                  </nav>
                </div>
              </div>
            </article>
          </div>
        </div>
      </main>

      {/* Right Sidebar - On This Page (Column 3, all the way right) */}
      {hasToc ? (
        <aside className="hidden xl:block">
          <div className="sticky top-16">
            <div
              className="scrollbar-hide pt-4 pl-2"
              style={{ maxHeight: `calc(100vh - ${NAVBAR_HEIGHT})`, overflowY: 'auto' }}
            >
              <TableOfContents headings={headings} />
            </div>
          </div>
        </aside>
      ) : (
        <div className="hidden xl:block" />
      )}
    </DocContentWrapper>
  );
}

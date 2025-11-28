import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getDocContent, extractHeadings } from '@/lib/docs/markdown';
import { getAllDocs, getAdjacentDocs } from '@/lib/docs/config';
import { MarkdownRenderer } from '@/components/docs/MarkdownRenderer';
import { TableOfContents } from '@/components/docs/TableOfContents';
import { Button } from '@heroui/button';
import Link from 'next/link';

interface DocPageProps {
  params: Promise<{
    slug: string;
  }>;
}

/**
 * Generate static params for all doc pages
 */
export async function generateStaticParams() {
  const docs = getAllDocs();

  return docs.map((doc) => ({
    slug: doc.slug,
  }));
}

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getDocContent(slug);

  if (!doc) {
    return {
      title: 'Documentation Not Found',
    };
  }

  return {
    title: `${doc.title} | Workflow Documentation`,
    description: doc.description,
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const doc = await getDocContent(slug);

  if (!doc) {
    notFound();
  }

  const headings = extractHeadings(doc.content);
  const { prev, next } = getAdjacentDocs(slug);

  return (
    <div className="relative w-full">
      <div className="max-w-[1600px] mx-auto px-8 py-8">
        <div className="flex gap-12">
          {/* Main Content */}
          <article className="flex-1 min-w-0 max-w-4xl">
            {/* Header */}
            <header className="mb-8 pb-8 border-b border-divider">
              <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-4">{doc.title}</h1>
              {doc.description && <p className="text-lg text-default-600">{doc.description}</p>}
            </header>

            {/* Markdown Content */}
            <div className="mb-12">
              <MarkdownRenderer content={doc.content} />
            </div>

            {/* Navigation Footer */}
            <nav className="mt-12 pt-8 border-t border-divider">
              <div className="flex items-center justify-between gap-4">
                {prev ? (
                  <Button as={Link} href={`/docs/${prev.slug}`} variant="flat" className="px-6">
                    <span className="flex flex-col items-start">
                      <span className="text-xs text-default-500">Previous</span>
                      <span className="font-medium">{prev.title}</span>
                    </span>
                  </Button>
                ) : (
                  <div />
                )}

                {next ? (
                  <Button as={Link} href={`/docs/${next.slug}`} variant="flat" className="px-6">
                    <span className="flex flex-col items-end">
                      <span className="text-xs text-default-500">Next</span>
                      <span className="font-medium">{next.title}</span>
                    </span>
                  </Button>
                ) : (
                  <div />
                )}
              </div>
            </nav>
          </article>

          {/* Right Sidebar - Table of Contents (Floating Box) */}
          {headings.length > 0 && (
            <aside className="hidden xl:block w-64 flex-shrink-0">
              <div className="sticky top-24">
                <div className="rounded-lg border border-divider bg-content1 p-6 shadow-sm">
                  <div className="max-h-[60vh] overflow-y-auto scrollbar-hide">
                    <TableOfContents headings={headings} />
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

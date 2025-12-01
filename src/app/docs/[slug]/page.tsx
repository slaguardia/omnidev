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

  const hasToc = headings.length > 0;

  return (
    <div
      className={`flex h-full flex-col gap-8 ${
        hasToc
          ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_260px] 2xl:grid-cols-[minmax(0,1fr)_320px]'
          : ''
      }`}
    >
      {/* Main Content */}
      <article className={`h-full min-w-0 ${hasToc ? '' : 'xl:col-span-2'}`}>
        <div className="px-6 py-4">
          <div className="mx-auto max-w-4xl pb-20">
            {/* Header */}
            <header className="mb-10 border-b border-divider pb-8">
              <h1 className="mb-4 text-4xl font-bold tracking-tight lg:text-5xl">{doc.title}</h1>
              {doc.description && <p className="text-lg text-default-600">{doc.description}</p>}
            </header>

            {/* Markdown Content */}
            <div className="mb-12">
              <MarkdownRenderer content={doc.content} />
            </div>

            {/* Navigation Footer */}
            <nav className="mt-12 border-t border-divider pt-8">
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
          </div>
        </div>
      </article>

      {/* Right Sidebar - Table of Contents */}
      {hasToc && (
        <aside className="relative hidden xl:block">
          <div className="sticky top-16">
            <div
              className="scrollbar-hide pr-1"
              style={{ maxHeight: 'calc(100vh - 4rem)', overflowY: 'auto' }}
            >
              <TableOfContents headings={headings} />
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

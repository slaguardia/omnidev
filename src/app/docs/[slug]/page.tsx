import { Suspense } from 'react';
import { Metadata } from 'next';
import { getDocContent } from '@/lib/docs/markdown';
import { getAllDocs } from '@/lib/docs/config';
import { DocContent } from '@/components/docs/DocContent';
import { DocContentSkeleton } from '@/components/docs/DocContentSkeleton';

interface DocPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export const dynamicParams = false;
export const dynamic = 'force-static';

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

  return (
    <Suspense fallback={<DocContentSkeleton />}>
      <DocContent slug={slug} />
    </Suspense>
  );
}

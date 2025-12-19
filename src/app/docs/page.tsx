import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getDocContent } from '@/lib/docs/markdown';
import { DocContent } from '@/components/docs/DocContent';
import { DocContentSkeleton } from '@/components/docs/DocContentSkeleton';

const DEFAULT_DOC_SLUG = 'quickstart';

export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const doc = await getDocContent(DEFAULT_DOC_SLUG);
  return {
    title: doc ? `${doc.title} | Workflow Documentation` : 'Documentation',
    description: doc?.description,
  };
}

export default function DocsPage() {
  return (
    <Suspense fallback={<DocContentSkeleton />}>
      <DocContent slug={DEFAULT_DOC_SLUG} />
    </Suspense>
  );
}

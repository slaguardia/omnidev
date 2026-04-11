import { Suspense } from 'react';
import { Metadata } from 'next';
import { getDocContent } from '@/lib/docs/markdown';
import { getAllDocs } from '@/lib/docs/config';
import { DocContent } from '@/components/docs/DocContent';
import { DocContentSkeleton } from '@/components/docs/DocContentSkeleton';
import { siteConfig } from '@/lib/config/site';

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
    title: doc.title,
    description:
      doc.description ||
      `${doc.title} - Omnidev documentation for self-hosted AI developer automation.`,
    openGraph: {
      title: `${doc.title} - Omnidev Docs`,
      description:
        doc.description ||
        `Learn about ${doc.title.toLowerCase()} in Omnidev, the self-hosted AI developer bot.`,
    },
  };
}

/**
 * Generate breadcrumb JSON-LD for documentation pages
 */
function generateBreadcrumbSchema(slug: string, title: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: siteConfig.url,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Documentation',
        item: `${siteConfig.url}/docs`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: title,
        item: `${siteConfig.url}/docs/${slug}`,
      },
    ],
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const doc = await getDocContent(slug);
  const breadcrumbSchema = doc ? generateBreadcrumbSchema(slug, doc.title) : null;

  return (
    <>
      {breadcrumbSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      )}
      <Suspense fallback={<DocContentSkeleton />}>
        <DocContent slug={slug} />
      </Suspense>
    </>
  );
}

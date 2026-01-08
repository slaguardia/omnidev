import { MetadataRoute } from 'next';

import { getAllDocs } from '@/lib/docs/config';
import { siteConfig } from '@/lib/config/site';

// High-priority documentation slugs (getting started, core features)
const HIGH_PRIORITY_DOCS = ['quickstart', 'docker', 'environment', 'api-operations'];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteConfig.url;

  // Static pages - core landing pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
  ];

  // Documentation pages with weighted priorities
  const docs = getAllDocs();
  const docPages: MetadataRoute.Sitemap = docs.map((doc) => ({
    url: `${baseUrl}/docs/${doc.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: HIGH_PRIORITY_DOCS.includes(doc.slug) ? 0.8 : 0.7,
  }));

  return [...staticPages, ...docPages];
}

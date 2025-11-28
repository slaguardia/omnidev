import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { getDocBySlug } from './config';

export interface DocContent {
  slug: string;
  title: string;
  description?: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

/**
 * Read and parse a markdown file from the docs directory
 */
export async function getDocContent(slug: string): Promise<DocContent | null> {
  const doc = getDocBySlug(slug);

  if (!doc) {
    return null;
  }

  const docsDirectory = path.join(process.cwd(), 'docs');
  const fullPath = path.join(docsDirectory, doc.file);

  try {
    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const { data, content } = matter(fileContents);

    return {
      slug: doc.slug,
      title: data.title || doc.title,
      description: data.description || doc.description,
      content,
      frontmatter: data,
    };
  } catch (error) {
    console.error(`Error reading doc file ${doc.file}:`, error);
    return null;
  }
}

/**
 * Extract headings from markdown content for table of contents
 */
export interface Heading {
  id: string;
  text: string;
  level: number;
}

export function extractHeadings(markdown: string, maxLevel: number = 2): Heading[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: Heading[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    if (!match[1] || !match[2]) continue;

    const level = match[1].length;

    // Only include headings up to maxLevel (default h2 only)
    if (level > maxLevel) continue;

    const text = match[2].trim();

    // Create a slug from the heading text
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');

    headings.push({ id, text, level });
  }

  return headings;
}

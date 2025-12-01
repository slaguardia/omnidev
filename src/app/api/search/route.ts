import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { docsConfig } from '@/lib/docs/config';

export interface SearchResult {
  title: string;
  slug: string;
  href: string;
  section: string;
  description?: string;
  // For content matches
  matchType: 'title' | 'description' | 'heading' | 'content';
  matchText?: string;
  matchContext?: string;
  headingAnchor?: string;
}

/**
 * Extract the closest heading above a given position in markdown
 */
function findClosestHeading(
  content: string,
  matchIndex: number
): { text: string; anchor: string } | null {
  const beforeMatch = content.substring(0, matchIndex);
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let lastHeading: { text: string; anchor: string } | null = null;
  let match;

  while ((match = headingRegex.exec(beforeMatch)) !== null) {
    if (match[2]) {
      const text = match[2].trim();
      const anchor = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      lastHeading = { text, anchor };
    }
  }

  return lastHeading;
}

/**
 * Get context around a match (surrounding text)
 */
function getMatchContext(content: string, matchIndex: number, matchLength: number): string {
  const contextChars = 80;
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(content.length, matchIndex + matchLength + contextChars);

  let context = content.substring(start, end);

  // Clean up markdown formatting
  context = context
    .replace(/[#*`_~[\]]/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  // Add ellipsis if truncated
  if (start > 0) context = '...' + context;
  if (end < content.length) context = context + '...';

  return context;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q')?.toLowerCase().trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results: SearchResult[] = [];
  const docsDirectory = path.join(process.cwd(), 'docs');

  // Search through all documentation
  for (const section of docsConfig) {
    for (const page of section.pages) {
      const fullPath = path.join(docsDirectory, page.file);

      try {
        const fileContents = fs.readFileSync(fullPath, 'utf8');
        const { content } = matter(fileContents);
        const lowerContent = content.toLowerCase();
        const lowerTitle = page.title.toLowerCase();
        const lowerDescription = page.description?.toLowerCase() || '';

        // Check title match
        if (lowerTitle.includes(query)) {
          const result: SearchResult = {
            title: page.title,
            slug: page.slug,
            href: `/docs/${page.slug}`,
            section: section.title,
            matchType: 'title',
          };
          if (page.description) result.description = page.description;
          results.push(result);
          continue; // Don't add duplicate results for the same page
        }

        // Check description match
        if (lowerDescription.includes(query)) {
          const result: SearchResult = {
            title: page.title,
            slug: page.slug,
            href: `/docs/${page.slug}`,
            section: section.title,
            matchType: 'description',
          };
          if (page.description) result.description = page.description;
          results.push(result);
          continue;
        }

        // Check heading matches
        const headingRegex = /^(#{1,6})\s+(.+)$/gm;
        let headingMatch;
        let foundHeadingMatch = false;

        while ((headingMatch = headingRegex.exec(content)) !== null) {
          if (headingMatch[2] && headingMatch[2].toLowerCase().includes(query)) {
            const headingText = headingMatch[2].trim();
            const anchor = headingText
              .toLowerCase()
              .replace(/[^\w\s-]/g, '')
              .replace(/\s+/g, '-');

            results.push({
              title: page.title,
              slug: page.slug,
              href: `/docs/${page.slug}#${anchor}`,
              section: section.title,
              matchType: 'heading',
              matchText: headingText,
              headingAnchor: anchor,
            });
            foundHeadingMatch = true;
            break; // Only add first heading match per page
          }
        }

        if (foundHeadingMatch) continue;

        // Check content match
        const contentIndex = lowerContent.indexOf(query);
        if (contentIndex !== -1) {
          const closestHeading = findClosestHeading(content, contentIndex);
          const context = getMatchContext(content, contentIndex, query.length);

          const result: SearchResult = {
            title: page.title,
            slug: page.slug,
            href: closestHeading
              ? `/docs/${page.slug}#${closestHeading.anchor}`
              : `/docs/${page.slug}`,
            section: section.title,
            matchType: 'content',
            matchContext: context,
          };
          if (closestHeading) {
            result.matchText = closestHeading.text;
            result.headingAnchor = closestHeading.anchor;
          }
          results.push(result);
        }
      } catch (error) {
        console.error(`Error reading doc file ${page.file}:`, error);
      }
    }
  }

  // Sort results: title matches first, then description, then heading, then content
  const matchTypeOrder = { title: 0, description: 1, heading: 2, content: 3 };
  results.sort((a, b) => matchTypeOrder[a.matchType] - matchTypeOrder[b.matchType]);

  return NextResponse.json({ results: results.slice(0, 20) }); // Limit to 20 results
}

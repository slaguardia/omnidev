'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import { Code } from '@heroui/code';
import { Snippet } from '@heroui/snippet';
import { Link } from '@heroui/link';
import { Divider } from '@heroui/divider';

/**
 * Custom components for rendering markdown elements
 */
const components = {
  // Headings with anchor links
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
    const text = String(children);
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');

    return (
      <h1 id={id} className="scroll-mt-20 text-4xl font-bold tracking-tight mb-4 mt-8" {...props}>
        {children}
      </h1>
    );
  },

  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
    const text = String(children);
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');

    return (
      <h2
        id={id}
        className="scroll-mt-20 text-3xl font-semibold tracking-tight mb-3 mt-8 border-b pb-2"
        {...props}
      >
        {children}
      </h2>
    );
  },

  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
    const text = String(children);
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');

    return (
      <h3
        id={id}
        className="scroll-mt-20 text-2xl font-semibold tracking-tight mb-2 mt-6"
        {...props}
      >
        {children}
      </h3>
    );
  },

  h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
    const text = String(children);
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');

    return (
      <h4
        id={id}
        className="scroll-mt-20 text-xl font-semibold tracking-tight mb-2 mt-4"
        {...props}
      >
        {children}
      </h4>
    );
  },

  // Paragraphs
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-4 leading-7" {...props}>
      {children}
    </p>
  ),

  // Links
  a: ({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const url = href || '#';
    const isExternal = url.startsWith('http');

    return (
      <Link
        href={url}
        isExternal={isExternal}
        showAnchorIcon={isExternal}
        className="text-primary hover:underline"
      >
        {children}
      </Link>
    );
  },

  // Inline code
  code: ({ children, className }: React.HTMLAttributes<HTMLElement>) => {
    // Check if this is a code block (has a language class) - handled by pre
    const isCodeBlock = className?.startsWith('language-') || className?.includes('hljs');

    if (isCodeBlock) {
      // Return just the text content for the Snippet component in pre
      return <>{children}</>;
    }

    // Inline code
    return <Code size="sm">{children}</Code>;
  },

  // Code blocks
  pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => {
    // Extract text content from children
    const getTextContent = (node: React.ReactNode): string => {
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) return node.map(getTextContent).join('');
      if (React.isValidElement(node) && node.props.children) {
        return getTextContent(node.props.children);
      }
      return '';
    };

    const text = getTextContent(children);

    // Check if this is an ASCII diagram (box-drawing characters) - check before filtering lines
    const isAsciiDiagram = /[┌┐└┘│─├┤┬┴┼╔╗╚╝║═╠╣╦╩╬]/.test(text);

    // If ASCII diagram, render with fixed-width font and horizontal scroll
    // Use original text to preserve spacing
    if (isAsciiDiagram) {
      return (
        <div className="mb-4 overflow-x-auto rounded-lg bg-content2 p-4">
          <pre className="text-base font-mono whitespace-pre leading-tight">{text.trim()}</pre>
        </div>
      );
    }

    const lines = text.split('\n').filter((line) => line.trim());

    // Check if this is a directory structure (tree characters or path-like lines)
    const isDirectoryStructure = lines.some(
      (line) =>
        /[├└│─]/.test(line) ||
        /^\s*(src|docs|public|components|lib|app|pages|node_modules|dist|build)\//.test(line.trim())
    );

    // If directory structure, render as non-copyable code block
    if (isDirectoryStructure) {
      return (
        <Code className="block w-full p-4 mb-4 text-base whitespace-pre-wrap break-words">
          {text}
        </Code>
      );
    }

    // Command prefixes that indicate copyable commands
    const commandPrefixes = [
      'npm',
      'pnpm',
      'yarn',
      'npx',
      'git',
      'cd',
      'cp',
      'mv',
      'mkdir',
      'rm',
      'touch',
      'cat',
      'echo',
      'export',
      'curl',
      'wget',
      'docker',
      'kubectl',
      'pip',
      'python',
      'node',
      'bun',
      'deno',
    ];

    // Check if this looks like a command block (most lines start with command prefixes or are standalone comments)
    const isCommandBlock =
      lines.length > 0 &&
      lines.filter((line) => {
        const trimmed = line.trim();
        // Only count lines that start with # as comments if they're standalone (no command on same line)
        if (trimmed.startsWith('#')) return true;
        return commandPrefixes.some((prefix) => trimmed.startsWith(prefix));
      }).length >=
        lines.length * 0.5;

    // If not a command block, render as a single copyable snippet
    if (!isCommandBlock) {
      return (
        <Snippet
          className="mb-4 w-full max-w-full"
          classNames={{
            base: 'w-full max-w-full',
            pre: 'whitespace-pre-wrap break-words text-base',
          }}
          hideSymbol
        >
          {text}
        </Snippet>
      );
    }

    // Render command block - standalone comments as text, commands (with inline comments) as snippets
    return (
      <div className="mb-4 space-y-2">
        {lines.map((line, i) => {
          const trimmedLine = line.trim();
          // Check if line is a standalone comment (starts with # and has no command)
          if (
            trimmedLine.startsWith('#') &&
            !commandPrefixes.some((prefix) => trimmedLine.includes(prefix))
          ) {
            return (
              <p key={i} className="text-default-500 text-sm italic">
                {trimmedLine.replace(/^#+\s*/, '')}
              </p>
            );
          }
          // Render as copyable snippet (includes commands with inline comments)
          return (
            <Snippet
              key={i}
              className="w-full max-w-full"
              classNames={{
                base: 'w-full max-w-full',
                pre: 'whitespace-pre-wrap break-words text-base',
              }}
              hideSymbol
            >
              {line}
            </Snippet>
          );
        })}
      </div>
    );
  },

  // Lists
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-inside mb-4 space-y-2 ml-4" {...props}>
      {children}
    </ul>
  ),

  ol: ({ children, ...props }: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-inside mb-4 space-y-2 ml-4" {...props}>
      {children}
    </ol>
  ),

  li: ({ children, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="leading-7 [&>p]:inline [&>p]:m-0 [&>strong]:inline" {...props}>
      {children}
    </li>
  ),

  // Blockquotes
  blockquote: ({ children, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="border-l-4 border-primary pl-4 italic my-4 text-default-600" {...props}>
      {children}
    </blockquote>
  ),

  // Tables
  table: ({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full divide-y divide-divider" {...props}>
        {children}
      </table>
    </div>
  ),

  thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="bg-content2" {...props}>
      {children}
    </thead>
  ),

  tbody: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <tbody className="divide-y divide-divider" {...props}>
      {children}
    </tbody>
  ),

  tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr {...props}>{children}</tr>
  ),

  th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableHeaderCellElement>) => (
    <th className="px-4 py-3 text-left text-sm font-semibold" {...props}>
      {children}
    </th>
  ),

  td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableDataCellElement>) => (
    <td className="px-4 py-3 text-sm" {...props}>
      {children}
    </td>
  ),

  // Horizontal rule
  hr: () => <Divider className="my-8" />,

  // Images
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt || ''} className="rounded-lg my-4 max-w-full h-auto" {...props} />
  ),
};

export interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

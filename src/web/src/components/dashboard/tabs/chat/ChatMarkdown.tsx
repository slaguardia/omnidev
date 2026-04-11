'use client';

import 'highlight.js/styles/github-dark.css';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Code } from '@heroui/code';
import { Link } from '@heroui/link';

const chatComponents = {
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-2 last:mb-0 leading-relaxed" {...props}>
      {children}
    </p>
  ),

  a: ({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const url = href || '#';
    const isExternal = url.startsWith('http');
    return (
      <Link
        href={url}
        isExternal={isExternal}
        showAnchorIcon={isExternal}
        className="text-primary hover:underline text-sm"
      >
        {children}
      </Link>
    );
  },

  code: ({ children, className }: React.HTMLAttributes<HTMLElement>) => {
    const isCodeBlock = className?.startsWith('language-') || className?.includes('hljs');
    if (isCodeBlock) return <>{children}</>;
    return (
      <Code size="sm" className="px-1.5 py-0.5">
        {children}
      </Code>
    );
  },

  pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className="my-2 p-3 rounded-lg bg-content2 overflow-x-auto text-sm">{children}</pre>
  ),

  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-inside mb-2 space-y-1 ml-2" {...props}>
      {children}
    </ul>
  ),

  ol: ({ children, ...props }: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-inside mb-2 space-y-1 ml-2" {...props}>
      {children}
    </ol>
  ),

  li: ({ children, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed [&>p]:inline [&>p]:m-0" {...props}>
      {children}
    </li>
  ),

  blockquote: ({ children, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-3 border-primary/40 pl-3 italic my-2 text-default-600 text-sm"
      {...props}
    >
      {children}
    </blockquote>
  ),

  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-lg font-semibold mt-3 mb-1" {...props}>
      {children}
    </h3>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4 className="text-base font-semibold mt-2 mb-1" {...props}>
      {children}
    </h4>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h5 className="text-sm font-semibold mt-2 mb-1" {...props}>
      {children}
    </h5>
  ),

  table: ({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full divide-y divide-divider text-sm" {...props}>
        {children}
      </table>
    </div>
  ),

  th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableHeaderCellElement>) => (
    <th className="px-2 py-1.5 text-left text-xs font-semibold" {...props}>
      {children}
    </th>
  ),

  td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableDataCellElement>) => (
    <td className="px-2 py-1.5 text-sm" {...props}>
      {children}
    </td>
  ),

  hr: () => <hr className="my-3 border-divider" />,
};

export interface ChatMarkdownProps {
  content: string;
}

export function ChatMarkdown({ content }: ChatMarkdownProps) {
  return (
    <div className="prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={chatComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

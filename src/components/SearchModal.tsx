'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, ModalContent, ModalBody } from '@heroui/modal';
import { Input } from '@heroui/input';
import { Kbd } from '@heroui/kbd';
import { useRouter } from 'next/navigation';
import { SearchIcon } from '@/components/Icons';

interface SearchItem {
  label: string;
  href: string;
  description?: string;
  category: 'page' | 'docs';
  section?: string;
  matchType?: 'title' | 'description' | 'heading' | 'content';
  matchContext?: string;
}

interface SearchModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

// Static app pages (always available)
const staticPages: SearchItem[] = [
  { label: 'Home', href: '/', description: 'Go to homepage', category: 'page' },
  { label: 'Dashboard', href: '/dashboard', description: 'View your dashboard', category: 'page' },
  {
    label: 'Documentation',
    href: '/docs/quickstart',
    description: 'Browse all documentation',
    category: 'page',
  },
  { label: 'About', href: '/about', description: 'About Omnidev', category: 'page' },
  { label: 'Sign In', href: '/signin', description: 'Sign in to your account', category: 'page' },
];

export const SearchModal = ({ isOpen, onOpenChange }: SearchModalProps) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [docResults, setDocResults] = useState<SearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();

  // Filter static pages based on query
  const filteredPages = useMemo(() => {
    if (!query.trim()) return staticPages;
    const lowerQuery = query.toLowerCase();
    return staticPages.filter(
      (item) =>
        item.label.toLowerCase().includes(lowerQuery) ||
        item.description?.toLowerCase().includes(lowerQuery)
    );
  }, [query]);

  // Search documentation via API
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setDocResults([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          const results: SearchItem[] = data.results.map(
            (result: {
              title: string;
              href: string;
              section: string;
              matchType: string;
              matchText?: string;
              matchContext?: string;
              description?: string;
            }) => ({
              label: result.title,
              href: result.href,
              section: result.section,
              category: 'docs' as const,
              matchType: result.matchType,
              description:
                result.matchType === 'content' && result.matchContext
                  ? result.matchContext
                  : result.matchType === 'heading' && result.matchText
                    ? `In section: ${result.matchText}`
                    : result.description,
            })
          );
          setDocResults(results);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Search error:', error);
        }
      } finally {
        setIsSearching(false);
      }
    }, 200); // 200ms debounce

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query]);

  // Combine results
  const allItems = useMemo(() => [...filteredPages, ...docResults], [filteredPages, docResults]);

  // Group by category
  const groupedItems = useMemo(() => {
    const pages = allItems.filter((item) => item.category === 'page');
    const docs = allItems.filter((item) => item.category === 'docs');
    return { pages, docs };
  }, [allItems]);

  // Flatten for keyboard navigation
  const flatItems = useMemo(() => [...groupedItems.pages, ...groupedItems.docs], [groupedItems]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setDocResults([]);
    }
  }, [isOpen]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, selectedIndex]);

  const handleSelect = useCallback(
    (href: string) => {
      router.push(href);
      onOpenChange(false);
    },
    [router, onOpenChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onOpenChange(false);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            handleSelect(flatItems[selectedIndex].href);
          }
          break;
      }
    },
    [flatItems, selectedIndex, handleSelect, onOpenChange]
  );

  const getMatchTypeLabel = (matchType?: string) => {
    switch (matchType) {
      case 'heading':
        return 'Section';
      case 'content':
        return 'Content';
      default:
        return null;
    }
  };

  const renderItem = (item: SearchItem, globalIndex: number) => {
    const matchLabel = getMatchTypeLabel(item.matchType);

    return (
      <button
        key={`${item.href}-${globalIndex}`}
        className={`w-full px-4 py-3 text-left flex flex-col transition-colors ${
          globalIndex === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-default-100'
        }`}
        onClick={() => handleSelect(item.href)}
        onMouseEnter={() => setSelectedIndex(globalIndex)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{item.label}</span>
          {item.section && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-default-100 text-default-500">
              {item.section}
            </span>
          )}
          {matchLabel && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">
              {matchLabel}
            </span>
          )}
        </div>
        {item.description && (
          <span className="text-sm text-default-400 line-clamp-2">{item.description}</span>
        )}
      </button>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="top"
      size="lg"
      hideCloseButton
      isDismissable
      classNames={{
        base: 'mt-20',
        body: 'p-0',
      }}
    >
      <ModalContent>
        <ModalBody>
          <div className="flex flex-col">
            <div className="flex items-center border-b border-divider px-4 py-3">
              <SearchIcon className="text-default-400 mr-3 flex-shrink-0" />
              <Input
                autoFocus
                classNames={{
                  base: 'flex-1',
                  inputWrapper: 'bg-transparent shadow-none border-none',
                  input: 'text-base',
                }}
                placeholder="Search pages and documentation..."
                value={query}
                onValueChange={setQuery}
                onKeyDown={handleKeyDown}
              />
              {isSearching && (
                <div className="mr-2 w-4 h-4 border-2 border-default-300 border-t-primary rounded-full animate-spin" />
              )}
              <Kbd className="ml-2" keys={['escape']}>
                ESC
              </Kbd>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {flatItems.length === 0 ? (
                <div className="px-4 py-8 text-center text-default-400">
                  {query.length < 2
                    ? 'Type at least 2 characters to search documentation'
                    : 'No results found'}
                </div>
              ) : (
                <>
                  {groupedItems.pages.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-xs font-semibold text-default-500 uppercase tracking-wider bg-default-50">
                        Pages
                      </div>
                      {groupedItems.pages.map((item, index) => renderItem(item, index))}
                    </div>
                  )}
                  {groupedItems.docs.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-xs font-semibold text-default-500 uppercase tracking-wider bg-default-50">
                        Documentation
                      </div>
                      {groupedItems.docs.map((item, index) =>
                        renderItem(item, groupedItems.pages.length + index)
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="border-t border-divider px-4 py-2 flex gap-4 text-xs text-default-400">
              <span className="flex items-center gap-1">
                <Kbd keys={['up', 'down']} /> to navigate
              </span>
              <span className="flex items-center gap-1">
                <Kbd keys={['enter']} /> to select
              </span>
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

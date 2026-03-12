'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Tooltip } from '@heroui/tooltip';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/dropdown';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import clsx from 'clsx';
import type { ChatConversation } from '@/lib/managers/chat-db';

interface ChatConversationListProps {
  conversations: ChatConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  isLoading?: boolean;
}

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

export function ChatConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  isLoading,
}: ChatConversationListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-divider/60">
        <span className="text-xs font-semibold text-default-500 uppercase tracking-wider">
          Conversations
        </span>
        <Tooltip content="New chat">
          <Button isIconOnly size="sm" variant="light" onPress={onCreate} isLoading={!!isLoading}>
            <Plus className="w-4 h-4" />
          </Button>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-default-400 text-xs">No conversations yet</div>
        ) : (
          <ul className="py-1">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(conv.id);
                    }
                  }}
                  className={clsx(
                    'group w-full flex items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-content2/60 cursor-pointer',
                    activeId === conv.id && 'bg-content2'
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-default-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{conv.title}</p>
                    <p className="text-xs text-default-400">{formatRelativeTime(conv.updatedAt)}</p>
                  </div>
                  <Dropdown>
                    <DropdownTrigger>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        color="danger"
                        className="w-6 h-6 min-w-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Confirm delete"
                      onAction={(key) => {
                        if (key === 'confirm') onDelete(conv.id);
                      }}
                    >
                      <DropdownItem
                        key="confirm"
                        color="danger"
                        className="text-danger"
                        startContent={<Trash2 className="w-3.5 h-3.5" />}
                      >
                        Delete conversation
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

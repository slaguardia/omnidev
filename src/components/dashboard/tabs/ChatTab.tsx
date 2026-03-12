'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Select, SelectItem } from '@heroui/select';
import { Chip } from '@heroui/chip';
import { Button } from '@heroui/button';
import { Tooltip } from '@heroui/tooltip';
import { addToast } from '@heroui/toast';
import { X } from 'lucide-react';
import { useWorkspaces, usePersistedState } from '@/hooks';
import {
  useChatConversations,
  useCreateConversation,
  useDeleteConversation,
} from '@/hooks/queries/useChatConversations';
import { useChat } from '@/hooks/queries/useChat';
import { ChatConversationList, ChatMessageList, ChatInput } from './chat';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';

export default function ChatTab() {
  const { workspaces } = useWorkspaces();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = usePersistedState<string | null>(
    'chat-workspace-id',
    null
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Conversations for selected workspace
  const { data: conversations = [], isLoading: convLoading } =
    useChatConversations(selectedWorkspaceId);

  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();

  // Chat state for active conversation
  const {
    messages,
    isStreaming,
    streamingContent,
    error,
    lastCreatedTask,
    sendMessage,
    stopStreaming,
  } = useChat(activeConversationId);

  // Show toast when a task is created from chat
  const lastToastedTaskRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastCreatedTask && lastCreatedTask.id !== lastToastedTaskRef.current) {
      lastToastedTaskRef.current = lastCreatedTask.id;
      addToast({
        title: 'Task created',
        description: `#${lastCreatedTask.taskNumber} ${lastCreatedTask.title}`,
        color: 'success',
      });
    }
  }, [lastCreatedTask]);

  const handleCreateConversation = useCallback(async () => {
    if (!selectedWorkspaceId) return;
    try {
      const conv = await createConversation.mutateAsync(selectedWorkspaceId);
      setActiveConversationId(conv.id);
    } catch {
      // Error handled by mutation
    }
  }, [selectedWorkspaceId, createConversation]);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      if (!selectedWorkspaceId) return;
      deleteConversation.mutate({ conversationId: id, workspaceId: selectedWorkspaceId });
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    },
    [selectedWorkspaceId, activeConversationId, deleteConversation]
  );

  // Auto-create conversation on first message if none active
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (activeConversationId) {
        sendMessage(content);
        return;
      }

      // Create a new conversation then send
      if (!selectedWorkspaceId) return;
      try {
        const conv = await createConversation.mutateAsync(selectedWorkspaceId);
        setActiveConversationId(conv.id);
        // Small delay to allow state to settle, then send
        setTimeout(() => {
          sendMessage(content);
        }, 50);
      } catch {
        // Error handled by mutation
      }
    },
    [activeConversationId, selectedWorkspaceId, sendMessage, createConversation]
  );

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-6 flex flex-col h-[calc(100vh)]">
      {/* Workspace selector bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-divider/60">
        <Tooltip
          content="Close the active conversation to switch workspaces"
          isDisabled={!activeConversationId}
        >
          <Select
            label="Workspace"
            labelPlacement="outside-left"
            placeholder="Select a workspace"
            selectedKeys={selectedWorkspaceId ? [selectedWorkspaceId] : []}
            isDisabled={!!activeConversationId}
            onChange={(e) => {
              setSelectedWorkspaceId(e.target.value || null);
              setActiveConversationId(null);
            }}
            classNames={{
              base: 'max-w-md items-center',
              trigger: 'bg-content2/60',
            }}
            size="sm"
          >
            {workspaces.map((ws) => (
              <SelectItem key={ws.id} textValue={getProjectDisplayName(ws.repoUrl)}>
                <div className="flex items-center gap-2">
                  <span className="truncate">{getProjectDisplayName(ws.repoUrl)}</span>
                  <Chip size="sm" variant="flat" className="text-xs">
                    {ws.branch}
                  </Chip>
                </div>
              </SelectItem>
            ))}
          </Select>
        </Tooltip>
        {activeConversationId && (
          <Tooltip content="Close conversation">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={() => setActiveConversationId(null)}
            >
              <X size={14} />
            </Button>
          </Tooltip>
        )}
      </div>

      {!selectedWorkspaceId ? (
        <div className="flex-1 flex items-center justify-center text-default-400">
          <p className="text-sm">Select a workspace to start chatting</p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Conversation sidebar */}
          <div className="w-56 shrink-0 border-r border-divider/60 bg-content1/50">
            <ChatConversationList
              conversations={conversations}
              activeId={activeConversationId}
              onSelect={setActiveConversationId}
              onCreate={handleCreateConversation}
              onDelete={handleDeleteConversation}
              isLoading={convLoading || createConversation.isPending}
            />
          </div>

          {/* Main chat area */}
          <div className="flex-1 flex flex-col min-w-0">
            <ChatMessageList
              messages={messages}
              streamingContent={streamingContent}
              isStreaming={isStreaming}
            />

            {/* Error display */}
            {error && (
              <div className="px-4 py-2 text-sm text-danger-500 bg-danger-50 dark:bg-danger-50/10">
                {error}
              </div>
            )}

            {/* Input bar */}
            <div className="px-4 py-3 border-t border-divider/60">
              <ChatInput
                onSend={handleSendMessage}
                onStop={stopStreaming}
                isStreaming={isStreaming}
                disabled={!selectedWorkspaceId}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

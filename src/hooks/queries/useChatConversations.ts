import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChatConversation } from '@/lib/managers/chat-db';

async function fetchConversations(workspaceId: string): Promise<ChatConversation[]> {
  const response = await fetch(`/api/chat?workspaceId=${encodeURIComponent(workspaceId)}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.conversations;
}

export function useChatConversations(workspaceId: string | null) {
  return useQuery({
    queryKey: ['chat-conversations', workspaceId],
    queryFn: () => fetchConversations(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 10_000,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create conversation');
      }
      const data = await response.json();
      return data.conversation as ChatConversation;
    },
    onSettled: (_data, _error, workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations', workspaceId] });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      workspaceId,
    }: {
      conversationId: string;
      workspaceId: string;
    }) => {
      const response = await fetch(`/api/chat/${conversationId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete conversation');
      }
      return workspaceId;
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations', variables.workspaceId] });
    },
  });
}

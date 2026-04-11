import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChatMessage } from '@/lib/managers/chat-db';
import { invalidateRalphBoardData } from '@/hooks/queries/useRalphBoardInvalidation';

export interface CreatedTaskInfo {
  id: string;
  title: string;
  taskNumber: number;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  lastCreatedTask: CreatedTaskInfo | null;
  sendMessage: (content: string) => void;
  stopStreaming: () => void;
}

/**
 * Core hook managing message state and SSE streaming for a chat conversation.
 *
 * Loads message history on conversation change, sends messages via POST
 * to the stream endpoint, and parses SSE events from the response.
 */
export function useChat(conversationId: string | null): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedTask, setLastCreatedTask] = useState<CreatedTaskInfo | null>(null);

  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef(conversationId);

  // Load message history when conversation changes
  useEffect(() => {
    conversationIdRef.current = conversationId;

    // Abort any active stream on conversation switch
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    setMessages([]);
    setStreamingContent('');
    setIsStreaming(false);
    setError(null);

    if (!conversationId) return;

    let cancelled = false;

    async function loadMessages() {
      try {
        const response = await fetch(`/api/chat/${conversationId}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && conversationIdRef.current === conversationId) {
          setMessages(data.messages || []);
        }
      } catch {
        // Silently fail on load
      }
    }

    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!conversationId || isStreaming) return;

      // Optimistic user message
      const optimisticMsg: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
        usageJson: null,
        durationMs: null,
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      setStreamingContent('');
      setError(null);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        try {
          const response = await fetch(`/api/chat/${conversationId}/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: content }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            setError(errData.error || `HTTP ${response.status}`);
            setIsStreaming(false);
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            setError('No response body');
            setIsStreaming(false);
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';
          let accumulated = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE events from buffer
            const lines = buffer.split('\n');
            buffer = '';

            let eventType = '';
            let eventData = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7);
              } else if (line.startsWith('data: ')) {
                eventData = line.slice(6);
              } else if (line === '' && eventType && eventData) {
                // Complete event
                try {
                  const parsed = JSON.parse(eventData) as Record<string, unknown>;

                  switch (eventType) {
                    case 'assistant_delta':
                      if (typeof parsed.content === 'string') {
                        accumulated += parsed.content;
                        setStreamingContent(accumulated);
                      }
                      break;

                    case 'result':
                      // If result has content and we haven't accumulated anything, use it
                      if (typeof parsed.content === 'string' && !accumulated) {
                        accumulated = parsed.content;
                        setStreamingContent(accumulated);
                      }
                      break;

                    case 'error':
                      if (typeof parsed.message === 'string') {
                        setError(parsed.message);
                      }
                      break;

                    case 'task_created': {
                      const taskInfo: CreatedTaskInfo = {
                        id: parsed.id as string,
                        title: parsed.title as string,
                        taskNumber: parsed.taskNumber as number,
                      };
                      setLastCreatedTask(taskInfo);
                      invalidateRalphBoardData(queryClient);
                      break;
                    }

                    case 'done': {
                      // Move accumulated content into messages array
                      const finalContent = accumulated.trim();
                      if (finalContent) {
                        const assistantMsg: ChatMessage = {
                          id:
                            typeof parsed.messageId === 'string'
                              ? parsed.messageId
                              : `msg-${Date.now()}`,
                          conversationId: conversationId!,
                          role: 'assistant',
                          content: finalContent,
                          createdAt: new Date().toISOString(),
                          usageJson: null,
                          durationMs: null,
                        };
                        setMessages((prev) => [...prev, assistantMsg]);
                      }
                      setStreamingContent('');
                      break;
                    }
                  }
                } catch {
                  // Skip unparseable event data
                }

                eventType = '';
                eventData = '';
              } else if (line !== '') {
                // Incomplete event — keep in buffer
                buffer += line + '\n';
              }
            }
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            setError((err as Error).message || 'Stream failed');
          }
        } finally {
          setIsStreaming(false);
          abortRef.current = null;
        }
      })();
    },
    [conversationId, isStreaming]
  );

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Preserve any partial streaming content as a message
    setStreamingContent((prev) => {
      const trimmed = prev.trim();
      if (trimmed && conversationIdRef.current) {
        const partialMsg: ChatMessage = {
          id: `partial-${Date.now()}`,
          conversationId: conversationIdRef.current,
          role: 'assistant',
          content: trimmed,
          createdAt: new Date().toISOString(),
          usageJson: null,
          durationMs: null,
        };
        setMessages((msgs) => [...msgs, partialMsg]);
      }
      return '';
    });
    setIsStreaming(false);
  }, []);

  return {
    messages,
    isStreaming,
    streamingContent,
    error,
    lastCreatedTask,
    sendMessage,
    stopStreaming,
  };
}

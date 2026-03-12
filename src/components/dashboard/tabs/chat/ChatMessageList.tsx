'use client';

import React, { useEffect, useRef } from 'react';
import { User, Bot } from 'lucide-react';
import { ChatMarkdown } from './ChatMarkdown';
import type { ChatMessage } from '@/lib/managers/chat-db';

interface ChatMessageListProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-content2'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <ChatMarkdown content={message.content} />
        )}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-default-200 flex items-center justify-center shrink-0 mt-1">
          <User className="w-4 h-4 text-default-600" />
        </div>
      )}
    </div>
  );
}

function StreamingBubble({ content }: { content: string }) {
  return (
    <div className="flex gap-3 justify-start">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="max-w-[80%] rounded-xl px-4 py-2.5 bg-content2">
        {content ? (
          <ChatMarkdown content={content} />
        ) : (
          <div className="flex gap-1 py-1">
            <span
              className="w-2 h-2 rounded-full bg-default-400 animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-2 h-2 rounded-full bg-default-400 animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-2 h-2 rounded-full bg-default-400 animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatMessageList({ messages, streamingContent, isStreaming }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center text-default-400">
        <div className="text-center space-y-2">
          <Bot className="w-10 h-10 mx-auto opacity-40" />
          <p className="text-sm">Send a message to start the conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-4 py-4 px-2">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isStreaming && <StreamingBubble content={streamingContent} />}
      <div ref={bottomRef} />
    </div>
  );
}

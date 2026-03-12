'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@heroui/button';
import { Textarea } from '@heroui/input';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setValue('');
    // Re-focus after send
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [value, isStreaming, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter to send
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="flex gap-2 items-end">
      <Textarea
        ref={textareaRef}
        value={value}
        onValueChange={setValue}
        onKeyDown={handleKeyDown}
        placeholder="Type a message... (Ctrl+Enter to send)"
        minRows={1}
        maxRows={6}
        variant="bordered"
        classNames={{
          inputWrapper: 'bg-content1',
        }}
        isDisabled={!!disabled}
      />
      {isStreaming ? (
        <Button
          isIconOnly
          color="danger"
          variant="flat"
          size="lg"
          onPress={onStop}
          aria-label="Stop streaming"
        >
          <Square className="w-4 h-4" />
        </Button>
      ) : (
        <Button
          isIconOnly
          color="primary"
          size="lg"
          onPress={handleSend}
          isDisabled={!value.trim() || disabled}
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Textarea } from '@heroui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Chip } from '@heroui/chip';
import { Inbox, Repeat, MessageCircleQuestion } from 'lucide-react';

interface TriageConfirmationModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  taskTitle: string;
  resolvedPrompt: string;
  maxIterations: number;
  returnQuestions: boolean;
  onConfirm: (editedPrompt: string) => void;
  onSkipChanged: (skip: boolean) => void;
  loading?: boolean;
}

export default function TriageConfirmationModal({
  isOpen,
  onOpenChange,
  taskTitle,
  resolvedPrompt,
  maxIterations,
  returnQuestions,
  onConfirm,
  onSkipChanged,
  loading = false,
}: TriageConfirmationModalProps) {
  const [editedPrompt, setEditedPrompt] = useState(resolvedPrompt);
  const [skipConfirmation, setSkipConfirmation] = useState(false);

  // Reset edited prompt when modal opens with new data
  useEffect(() => {
    if (isOpen) {
      setEditedPrompt(resolvedPrompt);
    }
  }, [isOpen, resolvedPrompt]);

  const handleConfirm = () => {
    if (skipConfirmation) {
      onSkipChanged(true);
    }
    onConfirm(editedPrompt);
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="center"
      size="2xl"
      scrollBehavior="inside"
      classNames={{
        base: 'dark:bg-[#1C1C20]/95 bg-white/95 backdrop-blur-lg border dark:border-white/[0.06] border-gray-200/40',
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Inbox className="w-5 h-5 text-warning-500" />
                Triage: {taskTitle}
              </h3>
              <p className="text-sm text-foreground-500 font-normal">
                Review and optionally edit the prompt before running triage.
              </p>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <Textarea
                  label="Triage Prompt"
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  variant="bordered"
                  minRows={8}
                  maxRows={20}
                  classNames={{
                    input: 'font-mono text-sm',
                  }}
                />

                <div className="flex gap-2 flex-wrap">
                  <Chip size="sm" variant="flat" startContent={<Repeat className="w-3 h-3" />}>
                    {maxIterations === 1 ? 'Single pass' : `${maxIterations} iterations`}
                  </Chip>
                  <Chip
                    size="sm"
                    variant="flat"
                    color={returnQuestions ? 'primary' : 'default'}
                    startContent={<MessageCircleQuestion className="w-3 h-3" />}
                  >
                    {returnQuestions ? 'Questions enabled' : 'No questions'}
                  </Chip>
                </div>

                <p className="text-xs text-foreground-400">
                  Iteration count and question settings are configured in Workflow Settings.
                </p>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipConfirmation}
                    onChange={(e) => setSkipConfirmation(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-foreground-600">
                    Don&apos;t show this confirmation again
                  </span>
                </label>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button
                color="warning"
                onPress={handleConfirm}
                isLoading={loading}
                isDisabled={!editedPrompt.trim()}
              >
                Run Triage
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

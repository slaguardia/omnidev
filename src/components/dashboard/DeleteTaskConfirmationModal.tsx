'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Trash2 } from 'lucide-react';

interface DeleteTaskConfirmationModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  taskTitle: string;
  onConfirm: () => void;
  loading?: boolean;
}

export default function DeleteTaskConfirmationModal({
  isOpen,
  onOpenChange,
  taskTitle,
  onConfirm,
  loading = false,
}: DeleteTaskConfirmationModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="center"
      size="md"
      classNames={{
        base: 'dark:bg-[#1C1C20]/95 bg-white/95 backdrop-blur-lg border dark:border-white/[0.06] border-gray-200/40',
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-danger-500" />
                Delete Task
              </h3>
            </ModalHeader>
            <ModalBody>
              <p className="text-foreground-600">
                Are you sure you want to permanently delete{' '}
                <span className="font-semibold text-foreground">{taskTitle}</span>?
              </p>
              <p className="text-sm text-danger-500">
                This action cannot be undone. The task and all its data will be removed.
              </p>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button color="danger" onPress={onConfirm} isLoading={loading}>
                Delete
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

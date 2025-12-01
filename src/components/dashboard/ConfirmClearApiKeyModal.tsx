'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmClearApiKeyModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  keysToRemove: string[];
  onConfirm: () => void;
  loading?: boolean;
}

export default function ConfirmClearApiKeyModal({
  isOpen,
  onOpenChange,
  keysToRemove,
  onConfirm,
  loading = false,
}: ConfirmClearApiKeyModalProps) {
  const handleConfirm = () => {
    onConfirm();
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const keyListText = keysToRemove.join(' and ');

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="center"
      size="md"
      classNames={{
        base: 'dark:bg-slate-800/80 bg-white/95 backdrop-blur-lg border dark:border-white/10 border-gray/20',
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-danger-500" />
                Remove API Key?
              </h3>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <p className="text-foreground-600">
                  You are about to remove your <strong>{keyListText}</strong>.
                </p>
                <div className="p-3 bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 rounded-lg">
                  <p className="text-sm text-warning-700 dark:text-warning-500">
                    This action cannot be undone. You will need to re-enter the API key to restore
                    functionality.
                  </p>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="flat" onClick={handleCancel}>
                Cancel
              </Button>
              <Button color="danger" onClick={handleConfirm} isLoading={loading}>
                Remove
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

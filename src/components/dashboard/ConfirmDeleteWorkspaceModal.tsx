'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDeleteWorkspaceModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  workspaceName: string;
  onConfirm: (deleteTasks: boolean) => void;
  loading?: boolean;
}

export default function ConfirmDeleteWorkspaceModal({
  isOpen,
  onOpenChange,
  workspaceName,
  onConfirm,
  loading = false,
}: ConfirmDeleteWorkspaceModalProps) {
  const [deleteTasks, setDeleteTasks] = useState(false);

  const handleCancel = () => {
    setDeleteTasks(false);
    onOpenChange(false);
  };

  const handleConfirm = () => {
    const shouldDeleteTasks = deleteTasks;
    setDeleteTasks(false);
    onConfirm(shouldDeleteTasks);
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) setDeleteTasks(false);
        onOpenChange(open);
      }}
      placement="center"
      size="md"
      classNames={{
        base: 'dark:bg-[#1C1C20]/95 bg-white/95 backdrop-blur-lg border dark:border-white/[0.06] border-gray-200/40',
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-danger-500" />
                Delete Workspace?
              </h3>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <p className="text-foreground-600">
                  You are about to delete <strong>{workspaceName}</strong>.
                </p>
                <div className="p-3 bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 rounded-lg">
                  <p className="text-sm text-warning-700 dark:text-warning-500">
                    This will remove the cloned repository from disk. This action cannot be undone.
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteTasks}
                    onChange={(e) => setDeleteTasks(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-foreground-600">
                    Also delete associated Ralph tasks
                  </span>
                </label>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="flat" onClick={handleCancel}>
                Cancel
              </Button>
              <Button color="danger" onClick={handleConfirm} isLoading={loading}>
                Delete
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

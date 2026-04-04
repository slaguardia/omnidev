'use client';

import { useState, useRef } from 'react';
import { Button } from '@heroui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { RotateCcw, Save } from 'lucide-react';
import WorkflowSettingsTab from '@/components/dashboard/tabs/WorkflowSettingsTab';
import type {
  WorkflowSettingsHandle,
  WorkflowBusyState,
} from '@/components/dashboard/tabs/WorkflowSettingsTab';
import { RalphSubTabs } from '@/components/dashboard/tabs/ralph/RalphSubTabs';

export default function WorkflowPage() {
  const workflowSettingsRef = useRef<WorkflowSettingsHandle>(null);
  const [busyState, setBusyState] = useState<WorkflowBusyState>('idle');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  return (
    <div className="space-y-6">
      <RalphSubTabs
        trailing={
          <div className="flex items-center gap-3">
            <Button
              color="primary"
              size="sm"
              startContent={<Save className="w-4 h-4" />}
              onPress={() => workflowSettingsRef.current?.save()}
              isLoading={busyState === 'saving'}
            >
              Save
            </Button>
            <Button
              variant="bordered"
              size="sm"
              startContent={<RotateCcw className="w-4 h-4" />}
              onPress={() => setIsResetConfirmOpen(true)}
              isLoading={busyState === 'resetting'}
            >
              Reset
            </Button>
          </div>
        }
      />

      <WorkflowSettingsTab ref={workflowSettingsRef} onBusyStateChange={setBusyState} />

      <Modal isOpen={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Reset Workflow</ModalHeader>
              <ModalBody>
                <p className="text-default-500">
                  This will reset all workflow stages back to their defaults. Any custom stages or
                  configuration will be lost.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="danger"
                  startContent={<RotateCcw className="w-4 h-4" />}
                  onPress={() => {
                    onClose();
                    workflowSettingsRef.current?.reset();
                  }}
                >
                  Reset to Defaults
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}

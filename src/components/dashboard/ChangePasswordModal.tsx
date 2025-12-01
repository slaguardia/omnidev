'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Lock } from 'lucide-react';
import { ChangePasswordForm } from '@/lib/dashboard/types';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onChangePassword: () => Promise<{ success: boolean; message: string }>;
  form: ChangePasswordForm;
  setForm: React.Dispatch<React.SetStateAction<ChangePasswordForm>>;
  loading: boolean;
}

export default function ChangePasswordModal({
  isOpen,
  onOpenChange,
  onChangePassword,
  form,
  setForm,
  loading,
}: ChangePasswordModalProps) {
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const result = await onChangePassword();
    if (!result.success) {
      setError(result.message);
    }
  };

  const handleClose = () => {
    setError(null);
    onOpenChange(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={handleClose}
      placement="center"
      size="md"
      classNames={{
        base: 'dark:bg-slate-800/80 bg-white/95 backdrop-blur-lg border dark:border-white/10 border-gray/20',
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Lock className="w-5 h-5 text-warning-500" />
                Change Password
              </h3>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                {error && (
                  <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg">
                    <p className="text-sm text-danger-600">{error}</p>
                  </div>
                )}
                <Input
                  label="Current Password"
                  type="password"
                  placeholder="Enter your current password"
                  value={form.currentPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                  }
                  variant="bordered"
                  isRequired
                />
                <Input
                  label="New Password"
                  type="password"
                  placeholder="Enter your new password"
                  value={form.newPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm((prev) => ({ ...prev, newPassword: e.target.value }))
                  }
                  variant="bordered"
                  isRequired
                  description="Minimum 6 characters"
                />
                <Input
                  label="Confirm New Password"
                  type="password"
                  placeholder="Confirm your new password"
                  value={form.confirmPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                  }
                  variant="bordered"
                  isRequired
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="flat" onClick={onClose}>
                Cancel
              </Button>
              <Button
                color="warning"
                onClick={handleSubmit}
                isLoading={loading}
                isDisabled={!form.currentPassword || !form.newPassword || !form.confirmPassword}
              >
                Change Password
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

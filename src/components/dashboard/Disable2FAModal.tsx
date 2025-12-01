'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { ShieldOff, AlertTriangle } from 'lucide-react';

interface Disable2FAModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete: () => void;
}

export default function Disable2FAModal({
  isOpen,
  onOpenChange,
  onComplete,
}: Disable2FAModalProps) {
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDisable = async () => {
    if (!password || !totpCode) {
      setError('Please enter both your password and verification code');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, token: totpCode }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to disable 2FA');
      }

      // Reset and close
      setPassword('');
      setTotpCode('');
      setError(null);
      onComplete();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setTotpCode('');
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
                <ShieldOff className="w-5 h-5 text-danger-500" />
                Disable Two-Factor Authentication
              </h3>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-warning-800">Warning</p>
                    <p className="text-xs text-warning-700 mt-1">
                      Disabling two-factor authentication will make your account less secure. You
                      will only need your password to sign in.
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg">
                    <p className="text-sm text-danger-600">{error}</p>
                  </div>
                )}

                <Input
                  label="Current Password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  variant="bordered"
                  isRequired
                />

                <Input
                  label="Verification Code"
                  placeholder="Enter 6-digit code from your authenticator"
                  value={totpCode}
                  onChange={(e) => {
                    setTotpCode(e.target.value);
                    setError(null);
                  }}
                  variant="bordered"
                  autoComplete="one-time-code"
                  isRequired
                  classNames={{
                    input: 'text-center tracking-widest',
                  }}
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="flat" onClick={onClose}>
                Cancel
              </Button>
              <Button
                color="danger"
                onClick={handleDisable}
                isLoading={loading}
                isDisabled={!password || !totpCode}
              >
                Disable 2FA
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

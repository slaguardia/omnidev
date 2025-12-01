'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Chip } from '@heroui/chip';
import { Shield, Copy, Check, AlertTriangle } from 'lucide-react';
import Image from 'next/image';

interface Enable2FAModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete: () => void;
}

type SetupStep = 'loading' | 'scan' | 'verify' | 'recovery' | 'complete';

interface SetupData {
  qrCode: string;
  secret: string;
  recoveryCodes: string[];
}

export default function Enable2FAModal({ isOpen, onOpenChange, onComplete }: Enable2FAModalProps) {
  const [step, setStep] = useState<SetupStep>('loading');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [acknowledgedCodes, setAcknowledgedCodes] = useState(false);

  const initializeSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize 2FA setup');
      }

      setSetupData(data);
      setStep('scan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize setup');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verificationCode) {
      setError('Please enter the verification code');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationCode }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid verification code');
      }

      setStep('recovery');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const copySecret = async () => {
    if (setupData?.secret) {
      await navigator.clipboard.writeText(setupData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const copyRecoveryCodes = async () => {
    if (setupData?.recoveryCodes) {
      await navigator.clipboard.writeText(setupData.recoveryCodes.join('\n'));
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  };

  const handleComplete = () => {
    setStep('loading');
    setSetupData(null);
    setVerificationCode('');
    setError(null);
    setAcknowledgedCodes(false);
    onComplete();
    onOpenChange(false);
  };

  const handleClose = () => {
    // Reset state on close
    setStep('loading');
    setSetupData(null);
    setVerificationCode('');
    setError(null);
    setAcknowledgedCodes(false);
    onOpenChange(false);
  };

  // Initialize setup when modal opens
  React.useEffect(() => {
    if (isOpen && step === 'loading') {
      initializeSetup();
    }
  }, [isOpen, step]);

  const renderContent = () => {
    switch (step) {
      case 'loading':
        return (
          <div className="flex flex-col items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-4 text-default-600">Setting up two-factor authentication...</p>
          </div>
        );

      case 'scan':
        return (
          <div className="space-y-4">
            <p className="text-default-600">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, Apple
              Passwords, etc.)
            </p>

            {setupData?.qrCode && (
              <div className="flex justify-center py-4">
                <div className="bg-white p-4 rounded-lg">
                  <Image
                    src={setupData.qrCode}
                    alt="2FA QR Code"
                    width={200}
                    height={200}
                    unoptimized
                  />
                </div>
              </div>
            )}

            <div className="bg-default-100 p-3 rounded-lg">
              <p className="text-xs text-default-500 mb-2">
                Can&apos;t scan? Enter this code manually:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono break-all">{setupData?.secret}</code>
                <Button size="sm" variant="flat" isIconOnly onClick={copySecret}>
                  {copiedSecret ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        );

      case 'verify':
        return (
          <div className="space-y-4">
            <p className="text-default-600">
              Enter the 6-digit code from your authenticator app to verify setup.
            </p>

            <Input
              label="Verification Code"
              placeholder="000000"
              value={verificationCode}
              onChange={(e) => {
                setVerificationCode(e.target.value);
                setError(null);
              }}
              variant="bordered"
              autoComplete="one-time-code"
              autoFocus
              classNames={{
                input: 'text-center text-xl tracking-widest',
              }}
            />
          </div>
        );

      case 'recovery':
        return (
          <div className="space-y-4">
            <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning-800">Save your recovery codes</p>
                <p className="text-xs text-warning-700 mt-1">
                  These codes can be used to access your account if you lose your authenticator.
                  Each code can only be used once. Store them securely.
                </p>
              </div>
            </div>

            <div className="bg-default-100 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-medium">Recovery Codes</p>
                <Button
                  size="sm"
                  variant="flat"
                  startContent={
                    copiedCodes ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />
                  }
                  onClick={copyRecoveryCodes}
                >
                  {copiedCodes ? 'Copied!' : 'Copy all'}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {setupData?.recoveryCodes.map((code, index) => (
                  <code
                    key={index}
                    className="text-sm font-mono bg-default-200 px-2 py-1 rounded text-center"
                  >
                    {code}
                  </code>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledgedCodes}
                onChange={(e) => setAcknowledgedCodes(e.target.checked)}
                className="w-4 h-4 rounded border-default-300"
              />
              <span className="text-sm text-default-600">
                I have saved my recovery codes in a secure location
              </span>
            </label>
          </div>
        );

      default:
        return null;
    }
  };

  const renderFooter = (onClose: () => void) => {
    switch (step) {
      case 'loading':
        return null;

      case 'scan':
        return (
          <>
            <Button color="default" variant="flat" onClick={onClose}>
              Cancel
            </Button>
            <Button color="primary" onClick={() => setStep('verify')}>
              Next
            </Button>
          </>
        );

      case 'verify':
        return (
          <>
            <Button color="default" variant="flat" onClick={() => setStep('scan')}>
              Back
            </Button>
            <Button
              color="primary"
              onClick={handleVerify}
              isLoading={loading}
              isDisabled={!verificationCode || verificationCode.length < 6}
            >
              Verify
            </Button>
          </>
        );

      case 'recovery':
        return (
          <Button
            color="success"
            onClick={handleComplete}
            isDisabled={!acknowledgedCodes}
            className="w-full"
          >
            Complete Setup
          </Button>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={handleClose}
      placement="center"
      size="md"
      isDismissable={step === 'loading' || step === 'scan'}
      classNames={{
        base: 'dark:bg-slate-800/80 bg-white/95 backdrop-blur-lg border dark:border-white/10 border-gray/20',
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5 text-success-500" />
                Enable Two-Factor Authentication
              </h3>
              {step !== 'loading' && (
                <div className="flex gap-2 mt-2">
                  <Chip
                    size="sm"
                    variant={step === 'scan' ? 'solid' : 'flat'}
                    color={step === 'scan' ? 'primary' : 'default'}
                  >
                    1. Scan
                  </Chip>
                  <Chip
                    size="sm"
                    variant={step === 'verify' ? 'solid' : 'flat'}
                    color={step === 'verify' ? 'primary' : 'default'}
                  >
                    2. Verify
                  </Chip>
                  <Chip
                    size="sm"
                    variant={step === 'recovery' ? 'solid' : 'flat'}
                    color={step === 'recovery' ? 'primary' : 'default'}
                  >
                    3. Save Codes
                  </Chip>
                </div>
              )}
            </ModalHeader>
            <ModalBody>
              {error && (
                <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg mb-4">
                  <p className="text-sm text-danger-600">{error}</p>
                </div>
              )}
              {renderContent()}
            </ModalBody>
            <ModalFooter>{renderFooter(onClose)}</ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

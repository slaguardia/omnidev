'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Lock, Info, Shield, ShieldCheck, ShieldOff } from 'lucide-react';
import { Divider } from '@heroui/divider';
import Enable2FAModal from '../Enable2FAModal';
import Disable2FAModal from '../Disable2FAModal';

interface AccountSecurityTabProps {
  onOpenChangePassword?: () => void;
}

interface TwoFactorStatus {
  enabled: boolean;
  hasRecoveryCodes: boolean;
}

export default function AccountSecurityTab({ onOpenChangePassword }: AccountSecurityTabProps) {
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isEnableModalOpen, setIsEnableModalOpen] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);

  const fetchTwoFactorStatus = async () => {
    try {
      const response = await fetch('/api/auth/2fa/status');
      if (response.ok) {
        const data = await response.json();
        setTwoFactorStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch 2FA status:', error);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchTwoFactorStatus();
  }, []);

  const handleTwoFactorComplete = () => {
    fetchTwoFactorStatus();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <h2 className="text-2xl font-semibold flex items-center gap-2">
        <Lock className="w-6 h-6 text-warning-500" />
        Account Security
      </h2>

      {/* Two-Factor Authentication */}
      <section className="flex flex-col gap-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-success-500">Two-Factor Authentication</h3>
          <Divider />
        </div>

        {isLoadingStatus ? (
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            <span className="text-sm text-default-500">Loading 2FA status...</span>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
              <div className="flex items-center gap-2">
                {twoFactorStatus?.enabled ? (
                  <>
                    <ShieldCheck className="w-5 h-5 text-success-500" />
                    <Chip color="success" variant="flat" size="sm">
                      Enabled
                    </Chip>
                  </>
                ) : (
                  <>
                    <ShieldOff className="w-5 h-5 text-default-400" />
                    <Chip color="default" variant="flat" size="sm">
                      Disabled
                    </Chip>
                  </>
                )}
              </div>

              {twoFactorStatus?.enabled ? (
                <Button
                  color="danger"
                  variant="flat"
                  onClick={() => setIsDisableModalOpen(true)}
                  startContent={<ShieldOff className="w-4 h-4" />}
                >
                  Disable 2FA
                </Button>
              ) : (
                <Button
                  color="success"
                  variant="flat"
                  onClick={() => setIsEnableModalOpen(true)}
                  startContent={<Shield className="w-4 h-4" />}
                >
                  Enable 2FA
                </Button>
              )}
            </div>

            <div className="p-4 bg-default-50 rounded-lg flex items-start gap-3">
              <Info className="w-4 h-4 text-default-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-default-600">
                {twoFactorStatus?.enabled
                  ? 'Two-factor authentication adds an extra layer of security to your account. You will need to enter a code from your authenticator app when signing in.'
                  : 'Enable two-factor authentication to add an extra layer of security to your account. You will need an authenticator app like Google Authenticator, Authy, or Apple Passwords.'}
              </p>
            </div>

            {twoFactorStatus?.enabled && !twoFactorStatus.hasRecoveryCodes && (
              <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg flex items-start gap-3">
                <Info className="w-4 h-4 text-warning-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-warning-700">
                  All your recovery codes have been used. Consider disabling and re-enabling 2FA to
                  generate new recovery codes.
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* Change Password */}
      <section className="flex flex-col gap-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-warning-500">Password</h3>
          <Divider />
        </div>
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
          <Button
            color="warning"
            variant="flat"
            onClick={onOpenChangePassword ?? (() => {})}
            startContent={<Lock className="w-4 h-4" />}
          >
            Change Password
          </Button>
          <p className="text-sm text-default-600">
            Update your account password. You will need your current password.
          </p>
        </div>
        <div className="p-4 bg-default-50 rounded-lg flex items-start gap-3">
          <Info className="w-4 h-4 text-default-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-default-600">
            Forgot your password? Since this system does not use email recovery, you can reset by
            deleting <code className="bg-default-200 px-1 rounded">/workspaces/users.json</code> and
            creating a new account. See the docs for details.
          </p>
        </div>
      </section>

      {/* Modals */}
      <Enable2FAModal
        isOpen={isEnableModalOpen}
        onOpenChange={setIsEnableModalOpen}
        onComplete={handleTwoFactorComplete}
      />
      <Disable2FAModal
        isOpen={isDisableModalOpen}
        onOpenChange={setIsDisableModalOpen}
        onComplete={handleTwoFactorComplete}
      />
    </div>
  );
}

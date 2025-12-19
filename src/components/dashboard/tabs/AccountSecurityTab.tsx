'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Lock, Info, Shield, ShieldCheck, ShieldOff, KeyRound } from 'lucide-react';
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
    <div className="space-y-6">
      {/* Header */}
      <h2 className="text-2xl font-semibold flex items-center gap-2">
        <Lock className="w-6 h-6 text-default-500" />
        Account Security
      </h2>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Two-Factor Authentication Card */}
        <Card className="bg-content1/60 border border-divider/60 shadow-sm">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-default-500" />
              <h3 className="font-semibold text-foreground">Two-Factor Authentication</h3>
              {twoFactorStatus?.enabled ? (
                <Chip size="sm" variant="flat" color="success">
                  Enabled
                </Chip>
              ) : (
                <Chip size="sm" variant="flat">
                  Disabled
                </Chip>
              )}
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5">
            {isLoadingStatus ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span className="text-sm text-default-500">Loading 2FA status...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                  <div className="flex items-center gap-2">
                    {twoFactorStatus?.enabled ? (
                      <ShieldCheck className="w-5 h-5 text-success-500" />
                    ) : (
                      <ShieldOff className="w-5 h-5 text-default-400" />
                    )}
                    <span className="text-sm text-default-700">
                      {twoFactorStatus?.enabled
                        ? 'Your account is protected with 2FA'
                        : '2FA is not enabled'}
                    </span>
                  </div>
                </div>

                {twoFactorStatus?.enabled ? (
                  <Button
                    color="danger"
                    variant="flat"
                    size="sm"
                    onClick={() => setIsDisableModalOpen(true)}
                    startContent={<ShieldOff className="w-4 h-4" />}
                  >
                    Disable 2FA
                  </Button>
                ) : (
                  <Button
                    color="primary"
                    variant="flat"
                    size="sm"
                    onClick={() => setIsEnableModalOpen(true)}
                    startContent={<Shield className="w-4 h-4" />}
                  >
                    Enable 2FA
                  </Button>
                )}

                <div className="p-3 bg-content2/60 border border-divider/50 rounded-xl flex items-start gap-2">
                  <Info className="w-4 h-4 text-default-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-default-500">
                    {twoFactorStatus?.enabled
                      ? 'You will need to enter a code from your authenticator app when signing in.'
                      : 'Enable 2FA to add an extra layer of security. You will need an authenticator app like Google Authenticator or Authy.'}
                  </p>
                </div>

                {twoFactorStatus?.enabled && !twoFactorStatus.hasRecoveryCodes && (
                  <div className="p-3 bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/20 rounded-lg flex items-start gap-2">
                    <Info className="w-4 h-4 text-warning-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-warning-700 dark:text-warning-400">
                      All your recovery codes have been used. Consider disabling and re-enabling 2FA
                      to generate new recovery codes.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Password Card */}
        <Card className="bg-content1/60 border border-divider/60 shadow-sm">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-default-500" />
              <h3 className="font-semibold text-foreground">Password</h3>
              <Chip size="sm" variant="flat" color="warning">
                Credentials
              </Chip>
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5">
            <div className="space-y-4">
              <p className="text-sm text-default-600">
                Update your account password. You will need your current password.
              </p>

              <Button
                color="primary"
                variant="flat"
                size="sm"
                onClick={onOpenChangePassword ?? (() => {})}
                startContent={<Lock className="w-4 h-4" />}
              >
                Change Password
              </Button>

              <div className="p-3 bg-content2/60 border border-divider/50 rounded-xl flex items-start gap-2">
                <Info className="w-4 h-4 text-default-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-default-500">
                  Forgot your password? Since this system does not use email recovery, you can reset
                  by deleting{' '}
                  <code className="bg-default-200 px-1 rounded text-xs">
                    /workspaces/users.json
                  </code>{' '}
                  and creating a new account.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

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

'use client';

import { useDashboard } from '@/components/dashboard/DashboardContext';
import AccountSecurityTab from '@/components/dashboard/tabs/AccountSecurityTab';

export default function SecurityPage() {
  const { setIsChangePasswordModalOpen } = useDashboard();

  return <AccountSecurityTab onOpenChangePassword={() => setIsChangePasswordModalOpen(true)} />;
}

'use client';

import { DashboardProvider } from '@/components/dashboard/DashboardContext';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-screen overflow-hidden -mt-16"
      style={{ background: 'rgb(var(--app-bg-0-rgb))' }}
    >
      <DashboardProvider>
        <DashboardShell>{children}</DashboardShell>
      </DashboardProvider>
    </div>
  );
}

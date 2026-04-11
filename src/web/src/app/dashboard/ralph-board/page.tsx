'use client';

import { Suspense } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import RalphBoardTab from '@/components/dashboard/tabs/RalphBoardTab';
import { RalphBoardPendingChrome } from '@/components/dashboard/tabs/ralph/RalphBoardPendingChrome';

export default function RalphBoardPage() {
  const { isPaletteOpen } = useDashboard();
  return (
    <Suspense fallback={<RalphBoardPendingChrome />}>
      <RalphBoardTab isPaletteOpen={isPaletteOpen} />
    </Suspense>
  );
}

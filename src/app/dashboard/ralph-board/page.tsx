'use client';

import { useDashboard } from '@/components/dashboard/DashboardContext';
import RalphBoardTab from '@/components/dashboard/tabs/RalphBoardTab';

export default function RalphBoardPage() {
  const { isPaletteOpen } = useDashboard();
  return <RalphBoardTab isPaletteOpen={isPaletteOpen} />;
}

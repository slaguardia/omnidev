'use client';

import dynamic from 'next/dynamic';
import { RalphSubTabs } from '@/components/dashboard/tabs/ralph/RalphSubTabs';

const PlaybooksSubtab = dynamic(() => import('@/components/dashboard/tabs/ralph/PlaybooksSubtab'));

export default function PlaybooksPage() {
  return (
    <div className="space-y-6">
      <RalphSubTabs />
      <PlaybooksSubtab />
    </div>
  );
}

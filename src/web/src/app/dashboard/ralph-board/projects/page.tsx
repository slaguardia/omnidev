'use client';

import dynamic from 'next/dynamic';
import { RalphSubTabs } from '@/components/dashboard/tabs/ralph/RalphSubTabs';

const ProjectsSubtab = dynamic(() => import('@/components/dashboard/tabs/ralph/ProjectsSubtab'));

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <RalphSubTabs />
      <ProjectsSubtab />
    </div>
  );
}

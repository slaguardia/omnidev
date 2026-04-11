import { RalphBoardPendingChrome } from '@/components/dashboard/tabs/ralph/RalphBoardPendingChrome';

/**
 * Shell while a Ralph board sub-route loads (Board, Projects, Workflow, Playbooks, task detail).
 * Next.js shows this during client navigations under `/dashboard/ralph-board/*`.
 * Sub-tab labels are real links immediately; only filters and page body use skeletons.
 */
export default function RalphBoardLoading() {
  return <RalphBoardPendingChrome />;
}

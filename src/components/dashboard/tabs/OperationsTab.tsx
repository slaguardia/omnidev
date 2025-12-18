'use client';

import React, { useEffect } from 'react';
import { Button } from '@heroui/button';
import { Bot } from 'lucide-react';
import { Select, SelectItem } from '@heroui/select';
import { Textarea } from '@heroui/input';
import { Workspace, ClaudeForm } from '@/lib/dashboard/types';
import { useBranches } from '@/hooks';
import { LabelWithTooltip } from '@/components/LabelWithTooltip';

interface OperationsTabProps {
  workspaces: Workspace[];
  claudeForm: ClaudeForm;
  setClaudeForm: React.Dispatch<React.SetStateAction<ClaudeForm>>;
  claudeResponse: string | null;
  loading: boolean;
  onAskClaude: () => void;
  getProjectDisplayName: (repoUrl: string) => string;
}

export default function OperationsTab({
  workspaces,
  claudeForm,
  setClaudeForm,
  claudeResponse,
  loading,
  onAskClaude,
  getProjectDisplayName,
}: OperationsTabProps) {
  const { branches, loading: loadingBranches, fetchBranches } = useBranches();

  // Get selected workspace
  const selectedWorkspace = workspaces.find((w) => w.id === claudeForm.workspaceId);
  const sourceBranchTooltip = selectedWorkspace
    ? `Defaults to workspace target branch: ${selectedWorkspace.branch}`
    : 'Select a workspace to choose a source branch';

  // Fetch branches when workspace changes
  useEffect(() => {
    if (claudeForm.workspaceId && selectedWorkspace) {
      fetchBranches(claudeForm.workspaceId);
    } else {
      setClaudeForm((prev) => ({ ...prev, sourceBranch: '' }));
    }
  }, [claudeForm.workspaceId, selectedWorkspace, fetchBranches, setClaudeForm]);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <h2 className="text-2xl font-semibold flex items-center gap-2">
        <Bot className="w-6 h-6 text-purple-500" />
        Ask Claude
      </h2>

      {/* Form */}
      <div className="flex flex-col gap-8">
        <Select
          isRequired
          size="md"
          label="Workspace"
          labelPlacement="outside"
          placeholder="Select a workspace"
          selectedKeys={claudeForm.workspaceId ? [claudeForm.workspaceId] : []}
          onSelectionChange={(keys: React.Key | Set<React.Key>) => {
            const keyArray = Array.from(keys as Set<React.Key>);
            setClaudeForm((prev) => ({ ...prev, workspaceId: keyArray[0] as string }));
          }}
          variant="bordered"
        >
          {workspaces.map((workspace) => (
            <SelectItem key={workspace.id}>{getProjectDisplayName(workspace.repoUrl)}</SelectItem>
          ))}
        </Select>

        <Select
          isDisabled={!claudeForm.workspaceId}
          size="md"
          label={
            <LabelWithTooltip label="Source Branch (optional)" tooltip={sourceBranchTooltip} />
          }
          labelPlacement="outside"
          placeholder={
            !claudeForm.workspaceId
              ? 'Select a workspace first'
              : loadingBranches
                ? 'Loading branches...'
                : 'Select source branch'
          }
          selectedKeys={claudeForm.workspaceId ? [claudeForm.sourceBranch || '__default__'] : []}
          onSelectionChange={
            claudeForm.workspaceId
              ? (keys: React.Key | Set<React.Key>) => {
                  const keyArray = Array.from(keys as Set<React.Key>);
                  const selectedKey = keyArray[0] as string | undefined;
                  if (!selectedKey || selectedKey === '__default__') {
                    setClaudeForm((prev) => ({ ...prev, sourceBranch: '' }));
                    return;
                  }
                  setClaudeForm((prev) => ({ ...prev, sourceBranch: selectedKey }));
                }
              : () => {} // No-op when no workspace selected
          }
          variant="bordered"
        >
          <>
            {claudeForm.workspaceId ? (
              <SelectItem key="__default__">Default (workspace target branch)</SelectItem>
            ) : null}
            {claudeForm.workspaceId && !loadingBranches
              ? branches.map((branch) => <SelectItem key={branch}>{branch}</SelectItem>)
              : null}
          </>
        </Select>

        <Textarea
          isRequired
          label="Question"
          labelPlacement="outside"
          placeholder="How can I optimize this code?"
          value={claudeForm.question}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setClaudeForm((prev) => ({ ...prev, question: e.target.value }))
          }
          variant="bordered"
          minRows={3}
        />

        <Textarea
          label="Additional Context (optional)"
          labelPlacement="outside"
          placeholder="I'm particularly interested in performance..."
          value={claudeForm.context}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setClaudeForm((prev) => ({ ...prev, context: e.target.value }))
          }
          variant="bordered"
          minRows={3}
        />

        <Button
          color="secondary"
          className="w-full sm:w-auto"
          onClick={onAskClaude}
          isLoading={loading}
          isDisabled={!claudeForm.workspaceId || !claudeForm.question}
        >
          Ask Claude
        </Button>
      </div>

      {/* Response */}
      {claudeResponse && (
        <div className="space-y-3 pt-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-500" />
            Response
          </h3>
          <div className="bg-default-100 dark:bg-default-50/10 p-4 rounded-lg">
            <pre className="whitespace-pre-wrap text-sm text-foreground-600 dark:text-foreground-400 font-sans">
              {claudeResponse}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

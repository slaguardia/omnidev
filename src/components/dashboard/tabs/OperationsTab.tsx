'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@heroui/button';
import { Bot, MessageSquare, Pencil, Send } from 'lucide-react';
import { Select, SelectItem } from '@heroui/select';
import { Textarea } from '@heroui/input';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Chip } from '@heroui/chip';
import { Workspace, ClaudeForm } from '@/lib/dashboard/types';
import { useBranches } from '@/hooks';
import { LabelWithTooltip } from '@/components/LabelWithTooltip';

type ClaudeOperationMode = 'ask' | 'edit';

interface OperationsTabProps {
  workspaces: Workspace[];
  claudeForm: ClaudeForm;
  setClaudeForm: React.Dispatch<React.SetStateAction<ClaudeForm>>;
  claudeResponse: string | null;
  setClaudeResponse: (value: string | null) => void;
  loading: boolean;
  onRunClaude: (mode: ClaudeOperationMode) => void;
  getProjectDisplayName: (repoUrl: string) => string;
}

export default function OperationsTab({
  workspaces,
  claudeForm,
  setClaudeForm,
  claudeResponse,
  setClaudeResponse,
  loading,
  onRunClaude,
  getProjectDisplayName,
}: OperationsTabProps) {
  const { branches, loading: loadingBranches, fetchBranches } = useBranches();
  const [mode, setMode] = useState<ClaudeOperationMode>('ask');

  // Get selected workspace
  const selectedWorkspace = workspaces.find((w) => w.id === claudeForm.workspaceId);
  const sourceBranchTooltip = selectedWorkspace
    ? `Defaults to workspace target branch: ${selectedWorkspace.branch}`
    : 'Select a workspace to choose a source branch';

  const copy = useMemo(() => {
    if (mode === 'edit') {
      return {
        title: 'Edit with Claude',
        promptLabel: 'Edit Request',
        promptPlaceholder: 'Update the code to add X, refactor Y, and ensure Z...',
        submitLabel: 'Run Edit',
        responsePlaceholder: 'Submit an edit request to see the job output here.',
      };
    }
    return {
      title: 'Ask Claude',
      promptLabel: 'Question',
      promptPlaceholder: 'How can I optimize this code?',
      submitLabel: 'Ask Claude',
      responsePlaceholder: "Submit a query to see Claude's response here.",
    };
  }, [mode]);

  // Fetch branches when workspace changes
  useEffect(() => {
    if (claudeForm.workspaceId && selectedWorkspace) {
      fetchBranches(claudeForm.workspaceId);
    } else {
      setClaudeForm((prev) => ({ ...prev, sourceBranch: '' }));
    }
  }, [claudeForm.workspaceId, selectedWorkspace, fetchBranches, setClaudeForm]);

  useEffect(() => {
    // Avoid showing stale output when switching modes.
    setClaudeResponse(null);
  }, [mode, setClaudeResponse]);

  return (
    <div className="flex flex-col gap-6 min-h-0 h-full">
      {/* Header + Mode Toggle */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Bot className="w-6 h-6 text-default-500" />
          {copy.title}
        </h2>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={mode === 'ask' ? 'solid' : 'flat'}
            color={mode === 'ask' ? 'primary' : 'default'}
            onClick={() => setMode('ask')}
          >
            Ask
          </Button>
          <Button
            size="sm"
            variant={mode === 'edit' ? 'solid' : 'flat'}
            color={mode === 'edit' ? 'primary' : 'default'}
            startContent={<Pencil className="w-4 h-4" />}
            onClick={() => setMode('edit')}
          >
            Edit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 items-stretch">
        {/* Query Form Card */}
        <Card className="glass-card-static h-full flex flex-col">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-default-500" />
              <h3 className="font-semibold text-default-700 dark:text-default-500">Input</h3>
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5 flex-1 min-h-0 flex flex-col gap-5">
            {/* Scrollable form fields */}
            <div className="flex-1 min-h-0 overflow-auto space-y-5">
              <div className="flex flex-col gap-1.5">
                <Select
                  isRequired
                  size="sm"
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
                    <SelectItem key={workspace.id}>
                      {getProjectDisplayName(workspace.repoUrl)}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Select
                  isDisabled={!claudeForm.workspaceId}
                  size="sm"
                  label={
                    <LabelWithTooltip
                      label="Source Branch (optional)"
                      tooltip={sourceBranchTooltip}
                    />
                  }
                  labelPlacement="outside"
                  placeholder={
                    !claudeForm.workspaceId
                      ? 'Select a workspace first'
                      : loadingBranches
                        ? 'Loading branches...'
                        : 'Select source branch'
                  }
                  selectedKeys={
                    claudeForm.workspaceId ? [claudeForm.sourceBranch || '__default__'] : []
                  }
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
                      : () => {}
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
              </div>

              <div className="flex flex-col gap-1.5">
                <Textarea
                  isRequired
                  label={copy.promptLabel}
                  labelPlacement="outside"
                  placeholder={copy.promptPlaceholder}
                  value={claudeForm.question}
                  onChange={(e) => setClaudeForm((prev) => ({ ...prev, question: e.target.value }))}
                  variant="bordered"
                  minRows={3}
                  size="sm"
                />
              </div>

              {mode === 'edit' ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">Open Merge Request</span>
                    <span className="text-xs text-default-500">
                      An MR will be opened against the target branch with the changes from this
                      request.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="flat"
                    color={claudeForm.createMR ? 'success' : 'default'}
                    onClick={() => setClaudeForm((prev) => ({ ...prev, createMR: !prev.createMR }))}
                  >
                    {claudeForm.createMR ? 'On' : 'Off'}
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <Textarea
                  label="Additional Context (optional)"
                  labelPlacement="outside"
                  placeholder="I'm particularly interested in performance..."
                  value={claudeForm.context}
                  onChange={(e) => setClaudeForm((prev) => ({ ...prev, context: e.target.value }))}
                  variant="bordered"
                  minRows={3}
                  size="sm"
                />
              </div>
            </div>

            {/* Sticky-ish actions at the bottom of the card */}
            <div className="flex flex-col gap-4">
              <Button
                color="primary"
                className="w-full"
                onClick={() => onRunClaude(mode)}
                isLoading={loading}
                isDisabled={!claudeForm.workspaceId || !claudeForm.question}
                startContent={!loading && <Send className="w-4 h-4" />}
              >
                {copy.submitLabel}
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Response Card */}
        <Card className="glass-card-static h-full flex flex-col">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-default-500" />
              <h3 className="font-semibold text-default-700 dark:text-default-500">Response</h3>
              {claudeResponse && (
                <Chip size="sm" variant="flat" color="success">
                  Ready
                </Chip>
              )}
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5 flex-1 min-h-0 overflow-auto">
            {claudeResponse ? (
              <div className="bg-content2/60 border border-divider/60 p-4 rounded-xl h-full overflow-auto">
                <pre className="whitespace-pre-wrap text-sm text-default-700 font-sans">
                  {claudeResponse}
                </pre>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bot className="w-12 h-12 text-default-300 mb-3" />
                <p className="text-sm text-default-500">{copy.responsePlaceholder}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

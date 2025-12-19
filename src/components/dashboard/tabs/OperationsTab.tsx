'use client';

import React, { useEffect } from 'react';
import { Button } from '@heroui/button';
import { Bot, MessageSquare, Send } from 'lucide-react';
import { Select, SelectItem } from '@heroui/select';
import { Textarea } from '@heroui/input';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Chip } from '@heroui/chip';
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
    <div className="space-y-6">
      {/* Header */}
      <h2 className="text-2xl font-semibold flex items-center gap-2">
        <Bot className="w-6 h-6 text-default-500" />
        Ask Claude
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Query Form Card */}
        <Card className="bg-content1/60 border border-divider/60 shadow-sm">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-default-500" />
              <h3 className="font-semibold text-foreground">Query</h3>
              <Chip size="sm" variant="flat" color="primary">
                Input
              </Chip>
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5 space-y-5">
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
                label="Question"
                labelPlacement="outside"
                placeholder="How can I optimize this code?"
                value={claudeForm.question}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setClaudeForm((prev) => ({ ...prev, question: e.target.value }))
                }
                variant="bordered"
                minRows={3}
                size="sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
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
                size="sm"
              />
            </div>

            <Button
              color="primary"
              className="w-full"
              onClick={onAskClaude}
              isLoading={loading}
              isDisabled={!claudeForm.workspaceId || !claudeForm.question}
              startContent={!loading && <Send className="w-4 h-4" />}
            >
              Ask Claude
            </Button>
          </CardBody>
        </Card>

        {/* Response Card */}
        <Card className="bg-content1/60 border border-divider/60 shadow-sm">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-default-500" />
              <h3 className="font-semibold text-foreground">Response</h3>
              {claudeResponse && (
                <Chip size="sm" variant="flat" color="success">
                  Ready
                </Chip>
              )}
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5">
            {claudeResponse ? (
              <div className="bg-content2/60 border border-divider/60 p-4 rounded-xl">
                <pre className="whitespace-pre-wrap text-sm text-default-700 font-sans">
                  {claudeResponse}
                </pre>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bot className="w-12 h-12 text-default-300 mb-3" />
                <p className="text-sm text-default-500">
                  Submit a query to see Claude&apos;s response here.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

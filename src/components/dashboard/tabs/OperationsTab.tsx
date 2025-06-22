'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Bot, GitBranch } from "lucide-react";
import { Select, SelectItem } from '@heroui/select';
import { Textarea } from '@heroui/input';
import { Workspace, ClaudeForm } from '../types';

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
  getProjectDisplayName
}: OperationsTabProps) {
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Get selected workspace
  const selectedWorkspace = workspaces.find(w => w.id === claudeForm.workspaceId);

  // Fetch branches when workspace changes
  useEffect(() => {
    if (claudeForm.workspaceId && selectedWorkspace) {
      fetchBranches(claudeForm.workspaceId);
      // Set default source branch to workspace target branch if not already set
      if (!claudeForm.sourceBranch) {
        setClaudeForm(prev => ({ 
          ...prev, 
          sourceBranch: (selectedWorkspace as any).targetBranch || selectedWorkspace.branch 
        }));
      }
    } else {
      setBranches([]);
      setClaudeForm(prev => ({ ...prev, sourceBranch: '' }));
    }
  }, [claudeForm.workspaceId, selectedWorkspace]);

  const fetchBranches = async (workspaceId: string) => {
    try {
      setLoadingBranches(true);
      const response = await fetch(`/api/workspaces/branches?workspaceId=${encodeURIComponent(workspaceId)}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Received branches from API:', data.branches);
        console.log('Current claudeForm.sourceBranch:', claudeForm.sourceBranch);
        setBranches(data.branches || []);
      } else {
        console.error('Failed to fetch branches:', await response.text());
        setBranches([]);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Ask Claude */}
      <Card className="glass-card max-w-2xl mx-auto">
        <CardHeader>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-500" />
            Ask Claude
          </h3>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <div className="space-y-10">
            <Select
              isRequired
              size="md"
              label="Workspace"
              labelPlacement="outside"
              placeholder="Select a workspace"
              selectedKeys={claudeForm.workspaceId ? [claudeForm.workspaceId] : []}
              onSelectionChange={(keys: any) => setClaudeForm(prev => ({ ...prev, workspaceId: Array.from(keys)[0] as string }))}
              variant="bordered"
            >
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.id}>
                  {getProjectDisplayName(workspace.repoUrl)}
                </SelectItem>
              ))}
            </Select>
            <Select
              isDisabled={!claudeForm.workspaceId}
              isRequired
              size="md"
              label="Source Branch (for MR edits)"
              labelPlacement="outside"
              description={selectedWorkspace ? (
                <p className="flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  Defaults to workspace target branch: <span className="font-mono">{(selectedWorkspace as any).targetBranch || selectedWorkspace.branch}</span>
                </p>
              ) : (
                <p className="flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  Select a workspace to choose a source branch
                </p>
              )}
              placeholder={
                !claudeForm.workspaceId 
                  ? "Select a workspace first" 
                  : loadingBranches 
                    ? "Loading branches..." 
                    : "Select source branch"
              }
              selectedKeys={claudeForm.sourceBranch ? [claudeForm.sourceBranch] : []}
              onSelectionChange={
                claudeForm.workspaceId 
                  ? (keys: any) => {
                      const selectedBranch = Array.from(keys)[0] as string;
                      console.log('Branch selected:', selectedBranch, 'keys:', keys);
                      setClaudeForm(prev => ({ ...prev, sourceBranch: selectedBranch }));
                    }
                  : () => {} // No-op when no workspace selected
              }
              variant="bordered"
            >
              {claudeForm.workspaceId && !loadingBranches ? branches.map((branch, index) => (
                <SelectItem key={branch}>
                  {branch}
                </SelectItem>
              )) : null}
            </Select>
            </div>
            <Textarea
              isRequired
              label="Question"
              placeholder="How can I optimize this code?"
              value={claudeForm.question}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClaudeForm(prev => ({ ...prev, question: e.target.value }))}
              variant="bordered"
              minRows={2}
            />
            <Textarea
              label="Additional Context (optional)"
              placeholder="I'm particularly interested in performance..."
              value={claudeForm.context}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClaudeForm(prev => ({ ...prev, context: e.target.value }))}
              variant="bordered"
              minRows={2}
            />
            <Button
              color="secondary"
              className="w-full"
              onClick={onAskClaude}
              isLoading={loading}
              isDisabled={!claudeForm.workspaceId || !claudeForm.question}
            >
              Ask Claude
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Claude Response */}
      {claudeResponse && (
        <Card className="glass-card max-w-2xl mx-auto">
          <CardHeader>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-500" />
              Claude's Response
            </h3>
          </CardHeader>
          <CardBody>
            <div className="bg-default-50 dark:bg-default-100 p-4 rounded-lg">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <div style={{ whiteSpace: 'pre-wrap' }}>{claudeResponse}</div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
} 
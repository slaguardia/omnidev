'use client';

import React, { useEffect } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { addToast } from "@heroui/toast";
import { Bot, GitBranch, Edit3, MessageSquare, AlertTriangle } from "lucide-react";
import { Select, SelectItem } from '@heroui/select';
import { Textarea, Input } from '@heroui/input';
import { Switch } from '@heroui/switch';
import { useBranches, useWorkspaces, useClaudeOperations } from '@/hooks';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';

export default function OperationsTab() {
  const { workspaces } = useWorkspaces();
  const { branches, loading: loadingBranches, fetchBranches } = useBranches();
  const { 
    claudeForm,
    claudeResponse,
    handleAskClaude,
    isEditForm,
    isEditMode,
    loading,
    setClaudeForm,
    switchToAskMode,
    switchToEditMode,
  } = useClaudeOperations();
  
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
          sourceBranch: selectedWorkspace.branch 
        }));
      }
    } else {
      setClaudeForm(prev => ({ ...prev, sourceBranch: '' }));
    }
  }, [claudeForm.workspaceId, selectedWorkspace, fetchBranches, setClaudeForm]);

  // Handler with toast notifications
  const handleClaudeWithToast = async () => {
    const result = await handleAskClaude();
    if (result.success) {
      addToast({ title: "Success", description: result.message, color: "success" });
    } else {
      addToast({ title: "Error", description: result.message, color: "danger" });
    }
  };

  return (
    <div className="space-y-6 w-full overflow-hidden">
      {/* Ask Claude */}
      <Card className="glass-card">
        <CardHeader>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-500" />
            {isEditMode ? 'Edit with Claude' : 'Ask Claude'}
          </h3>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {/* Mode Toggle */}
            <div className="flex items-center gap-4 mb-10">
              <div className="flex items-center gap-3">
              <Switch
                isSelected={isEditMode}
                onValueChange={(checked: boolean) => {
                  if (checked) {
                    switchToEditMode();
                  } else {
                    switchToAskMode();
                  }
                }}
              />
                <div className="flex items-center gap-2">
                  {isEditMode ? (
                    <Edit3 className="w-4 h-4 text-orange-500" />
                  ) : (
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                  )}
                  <span className="text-sm font-medium">
                    {isEditMode ? 'Edit Mode' : 'Ask Mode'}
                  </span>
                </div>
              </div>
              <span className="text-xs text-default-500">
                {isEditMode 
                  ? 'Claude will make direct code changes' 
                  : 'Claude will provide analysis and suggestions'
                }
              </span>
            </div>
            
            <div className="space-y-10">
            <Select
              isRequired
              size="md"
              label="Workspace"
              labelPlacement="outside"
              placeholder="Select a workspace"
              selectedKeys={claudeForm.workspaceId ? [claudeForm.workspaceId] : []}
              onSelectionChange={(keys: React.Key | Set<React.Key>) => {
                const keyArray = Array.from(keys as Set<React.Key>);
                setClaudeForm(prev => ({ ...prev, workspaceId: keyArray[0] as string }));
              }}
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
                  Defaults to workspace target branch: <span className="font-mono">{selectedWorkspace.branch}</span>
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
                  ? (keys: React.Key | Set<React.Key>) => {
                      const keyArray = Array.from(keys as Set<React.Key>);
                      const selectedBranch = keyArray[0] as string;
                      console.log('Branch selected:', selectedBranch, 'keys:', keys);
                      setClaudeForm(prev => ({ ...prev, sourceBranch: selectedBranch }));
                    }
                  : () => {} // No-op when no workspace selected
              }
              variant="bordered"
            >
              {claudeForm.workspaceId && !loadingBranches ? branches.map((branch) => (
                <SelectItem key={branch}>
                  {branch}
                </SelectItem>
              )) : []}
            </Select>
            </div>
            <Textarea
              isRequired
              label={isEditMode ? "Edit Request" : "Question"}
              placeholder={isEditMode 
                ? "Add error handling to this function" 
                : "How can I optimize this code?"
              }
              value={claudeForm.question}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClaudeForm(prev => ({ ...prev, question: e.target.value }))}
              variant="bordered"
              minRows={2}
            />
            <Textarea
              label="Additional Context (optional)"
              placeholder="I&apos;m particularly interested in performance..."
              value={claudeForm.context}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClaudeForm(prev => ({ ...prev, context: e.target.value }))}
              variant="bordered"
              minRows={2}
            />
            
            {/* Merge Request Options - Only shown in Edit Mode */}
            {isEditForm(claudeForm) && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Switch
                    isSelected={claudeForm.createMR}
                    onValueChange={(checked: boolean) => setClaudeForm(prev => ({ ...prev, createMR: checked }))}
                  />
                  <span className="text-sm">Create Merge Request</span>
                </div>
                {claudeForm.createMR && (
                  <p className="text-xs text-default-500 pl-6">
                    When enabled, Claude will create a new branch and merge request with the changes
                  </p>
                )}
                {!claudeForm.createMR && (
                  <div className="flex items-start gap-2 p-3 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-warning-600 dark:text-warning-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-warning-700 dark:text-warning-300">
                      <p className="font-medium mb-1">Direct Merge Warning</p>
                      <p>Changes will be merged directly into the target branch without a merge request. This bypasses code review and may affect the main branch.</p>
                    </div>
                  </div>
                )}
                
                {claudeForm.createMR && (
                  <div className="space-y-4 pl-6 border-l-2 border-default-200">
                      <Input
                    label="Task ID (optional)"
                    placeholder="e.g., TASK-123"
                    value={claudeForm.taskId}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClaudeForm(prev => ({ ...prev, taskId: e.target.value }))}
                    variant="bordered"
                    size="md"
                    description="The task or issue ID for the merge request"
                  />
                  <Input
                    label="Task Name (optional)"
                    placeholder="e.g., Optimize database queries"
                    value={claudeForm.taskName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClaudeForm(prev => ({ ...prev, taskName: e.target.value }))}
                    variant="bordered"
                    size="md"
                    description="A descriptive name for the task or feature"
                  />
                  <Input
                    label="New Branch Name (optional)"
                    placeholder="e.g., feature/optimize-queries"
                    value={claudeForm.newBranchName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClaudeForm(prev => ({ ...prev, newBranchName: e.target.value }))}
                    variant="bordered"
                    size="md"
                    description="The name for the new branch that will be created"
                  />
                  </div>
                )}
              </div>
            )}
            
            <Button
              color="secondary"
              className="w-full"
              onPress={handleClaudeWithToast}
              isLoading={loading}
              isDisabled={
                !claudeForm.workspaceId || 
                !claudeForm.question
              }
            >
              {isEditMode ? 'Edit with Claude' : 'Ask Claude'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Claude Response */}
      {claudeResponse && (
        <Card className="glass-card">
          <CardHeader>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-500" />
              {isEditMode ? 'Claude\'s Changes' : 'Claude\'s Response'}
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
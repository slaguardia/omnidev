import { useState } from 'react';
import { ClaudeForm, AskForm, EditForm } from '@/lib/dashboard/types';
import { transformFormToApiParams } from '@/lib/api/types';

// Initial form states
const initialAskForm: AskForm = {
  workspaceId: '',
  question: '',
  context: '',
  sourceBranch: '',
};

const initialEditForm: EditForm = {
  workspaceId: '',
  question: '',
  context: '',
  sourceBranch: '',
  createMR: true,
  taskId: '',
  taskName: '',
  newBranchName: '',
};

export const useClaudeOperations = () => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [claudeForm, setClaudeForm] = useState<ClaudeForm>(initialAskForm);
  const [claudeResponse, setClaudeResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Helper function to check the form type
  const isEditForm = (form: ClaudeForm): form is EditForm => isEditMode;

  // Helper function to switch to Ask mode
  const switchToAskMode = () => {
    setIsEditMode(false);
    setClaudeForm({
      ...initialAskForm,
      workspaceId: claudeForm.workspaceId,
      question: claudeForm.question,
      context: claudeForm.context,
      sourceBranch: claudeForm.sourceBranch,
    });
  };

  // Helper function to switch to Edit mode
  const switchToEditMode = () => {
    setIsEditMode(true);
    setClaudeForm({
      ...initialEditForm,
      workspaceId: claudeForm.workspaceId,
      question: claudeForm.question,
      context: claudeForm.context,
      sourceBranch: claudeForm.sourceBranch,
    });
  };

  const handleAskClaude = async () => {
    try {
      setLoading(true);
      setClaudeResponse(null);
      
      const endpoint = isEditMode ? '/api/edit' : '/api/ask';
      
      // Transform form data to API parameters with type safety
      const payload = transformFormToApiParams(claudeForm);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setClaudeResponse(data.response);
        const method = data.method === 'claude-code' ? 'Claude Code' : 'Claude API';
        const usageInfo = data.usage ? ` (${data.usage.inputTokens} input, ${data.usage.outputTokens} output tokens)` : '';
        return { 
          success: true, 
          message: `${method} responded successfully!${usageInfo}`,
          response: data.response
        };
      } else {
        throw new Error(data.error || 'Claude request failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { 
        success: false, 
        message: `Claude request failed: ${errorMessage}`, 
        error 
      };
    } finally {
      setLoading(false);
    }
  };

  return {
    claudeForm,
    claudeResponse,
    handleAskClaude,
    isEditForm,
    isEditMode,
    loading,
    setClaudeForm,
    setClaudeResponse,
    switchToAskMode,
    switchToEditMode,
  };
}; 
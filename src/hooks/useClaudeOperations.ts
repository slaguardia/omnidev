import { useState } from 'react';
import { ClaudeForm } from '@/lib/dashboard/types';

const initialClaudeForm: ClaudeForm = {
  workspaceId: '',
  question: '',
  context: '',
  sourceBranch: ''
};

export const useClaudeOperations = () => {
  const [claudeForm, setClaudeForm] = useState<ClaudeForm>(initialClaudeForm);
  const [claudeResponse, setClaudeResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAskClaude = async () => {
    try {
      setLoading(true);
      setClaudeResponse(null);
      
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(claudeForm)
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

  const resetClaudeForm = () => {
    setClaudeForm(initialClaudeForm);
    setClaudeResponse(null);
  };

  return {
    claudeForm,
    setClaudeForm,
    claudeResponse,
    setClaudeResponse,
    loading,
    handleAskClaude,
    resetClaudeForm
  };
}; 
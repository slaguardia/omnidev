import { useState, useEffect } from 'react';
import { Workspace } from '@/components/dashboard/types';

export const useWorkspaces = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);

  const loadWorkspaces = async () => {
    try {
      const response = await fetch('/api/workspaces');
      if (response.ok) {
        const data = await response.json();
        setWorkspaces(data.data || data.workspaces || []);
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    }
  };

  const handleCleanupWorkspace = async (workspaceId?: string, all = false) => {
    try {
      setLoading(true);
      const response = await fetch('/api/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, all, force: true })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        await loadWorkspaces();
        return { success: true, message: 'Cleanup completed!' };
      } else {
        throw new Error(data.error || 'Cleanup failed');
      }
    } catch (error) {
      return { success: false, message: 'Cleanup failed', error };
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  return {
    workspaces,
    loading,
    loadWorkspaces,
    handleCleanupWorkspace
  };
}; 
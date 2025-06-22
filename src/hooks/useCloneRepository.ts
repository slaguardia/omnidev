import { useState } from 'react';
import { CloneForm } from '@/components/dashboard/types';

const initialCloneForm: CloneForm = {
  repoUrl: '',
  branch: '',
  depth: '1',
  singleBranch: true,
  showCredentials: false,
  credentials: {
    username: '',
    password: ''
  }
};

export const useCloneRepository = () => {
  const [cloneForm, setCloneForm] = useState<CloneForm>(initialCloneForm);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCloneRepository = async () => {
    try {
      setLoading(true);
      const requestBody = {
        repoUrl: cloneForm.repoUrl,
        branch: cloneForm.branch,
        depth: cloneForm.depth,
        singleBranch: cloneForm.singleBranch,
        ...(cloneForm.showCredentials && cloneForm.credentials.username && cloneForm.credentials.password && {
          credentials: cloneForm.credentials
        })
      };

      const response = await fetch('/api/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setCloneForm(initialCloneForm);
        setIsCloneModalOpen(false);
        return { success: true, message: 'Repository cloned successfully!' };
      } else {
        throw new Error(data.error || 'Clone failed');
      }
    } catch (error) {
      return { success: false, message: 'Clone failed', error };
    } finally {
      setLoading(false);
    }
  };

  const resetCloneForm = () => {
    setCloneForm(initialCloneForm);
  };

  return {
    cloneForm,
    setCloneForm,
    isCloneModalOpen,
    setIsCloneModalOpen,
    loading,
    handleCloneRepository,
    resetCloneForm
  };
}; 
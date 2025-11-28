'use client';

import { useState } from 'react';
import { CloneForm } from '@/lib/dashboard/types';
import { cloneRepositoryAction } from '@/lib/workspace';

const initialCloneForm: CloneForm = {
  repoUrl: '',
  branch: '',
  depth: '1',
  singleBranch: true,
  showCredentials: false,
  credentials: {
    username: '',
    password: '',
  },
};

export const useCloneRepository = () => {
  const [cloneForm, setCloneForm] = useState<CloneForm>(initialCloneForm);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCloneRepository = async () => {
    try {
      setLoading(true);

      // Prepare clone options
      const credentials =
        cloneForm.showCredentials &&
        cloneForm.credentials.username &&
        cloneForm.credentials.password
          ? cloneForm.credentials
          : undefined;

      // Call server action to clone repository
      const result = await cloneRepositoryAction(
        cloneForm.repoUrl,
        cloneForm.branch || undefined,
        parseInt(cloneForm.depth) || 1,
        cloneForm.singleBranch,
        credentials
      );

      if (result.success) {
        setCloneForm(initialCloneForm);
        setIsCloneModalOpen(false);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Clone failed',
        error,
      };
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
    resetCloneForm,
  };
};

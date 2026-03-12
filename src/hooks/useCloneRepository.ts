'use client';

import { useState } from 'react';
import { CloneForm } from '@/lib/dashboard/types';
import { cloneRepositoryAction } from '@/lib/workspace';

const initialCloneForm: CloneForm = {
  repoUrl: '',
  branch: '',
};

export const useCloneRepository = () => {
  const [cloneForm, setCloneForm] = useState<CloneForm>(initialCloneForm);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCloneRepository = async () => {
    try {
      setLoading(true);

      // Call server action to clone repository (credentials come from config)
      const result = await cloneRepositoryAction(cloneForm.repoUrl, cloneForm.branch || undefined);

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

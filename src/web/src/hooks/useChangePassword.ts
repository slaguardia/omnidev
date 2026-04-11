import { useState } from 'react';
import { ChangePasswordForm } from '@/lib/dashboard/types';

const initialForm: ChangePasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export const useChangePassword = () => {
  const [form, setForm] = useState<ChangePasswordForm>(initialForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      return { success: false, message: 'All fields are required' };
    }

    if (form.newPassword !== form.confirmPassword) {
      return { success: false, message: 'New passwords do not match' };
    }

    if (form.newPassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters' };
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, message: data.error || 'Failed to change password' };
      }

      setForm(initialForm);
      setIsModalOpen(false);
      return { success: true, message: 'Password changed successfully' };
    } catch {
      return { success: false, message: 'Error changing password' };
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setForm(initialForm);
  };

  return {
    form,
    setForm,
    isModalOpen,
    setIsModalOpen,
    loading,
    handleChangePassword,
    closeModal,
  };
};

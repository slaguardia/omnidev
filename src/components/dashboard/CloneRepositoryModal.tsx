'use client';

import React from 'react';
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Switch } from "@heroui/switch";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Tooltip } from "@heroui/tooltip";
import { GitBranch, Info } from "lucide-react";
import { CloneForm } from '@/lib/dashboard/types';

interface CloneRepositoryModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onClone: () => Promise<void>;
  cloneForm: CloneForm;
  setCloneForm: React.Dispatch<React.SetStateAction<CloneForm>>;
  loading: boolean;
}

export default function CloneRepositoryModal({
  isOpen,
  onOpenChange,
  onClone,
  cloneForm,
  setCloneForm,
  loading
}: CloneRepositoryModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="center"
      size="2xl"
      scrollBehavior="inside"
      classNames={{
        base: "dark:bg-slate-800/80 bg-white/95 backdrop-blur-lg border dark:border-white/10 border-gray/20",
        backdrop: "",
        header: "",
        body: "",
        footer: "",
        closeButton: "",
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-green-500" />
                Clone Repository
              </h3>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <Input
                  label="Repository URL"
                  placeholder="https://gitlab.com/user/repo.git"
                  value={cloneForm.repoUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCloneForm(prev => ({ ...prev, repoUrl: e.target.value }))}
                  variant="bordered"
                />
                <Input
                  label="Branch (optional)"
                  placeholder="main"
                  value={cloneForm.branch}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCloneForm(prev => ({ ...prev, branch: e.target.value }))}
                  variant="bordered"
                />
                <div className="flex gap-4">
                  <Input
                    label="Depth"
                    type="number"
                    value={cloneForm.depth}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCloneForm(prev => ({ ...prev, depth: e.target.value }))}
                    variant="bordered"
                    className="flex-1"
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        isSelected={cloneForm.singleBranch}
                        onValueChange={(checked: boolean) => setCloneForm(prev => ({ ...prev, singleBranch: checked }))}
                      />
                      <span className="text-sm">Single Branch</span>
                      <Tooltip
                        content="Only clone the specified branch instead of all branches. This creates a faster, lighter clone."
                        placement="top"
                        showArrow
                      >
                        <button className="flex items-center justify-center w-5 h-5 rounded-full bg-default-200 hover:bg-default-300 transition-colors">
                          <Info className="w-4 h-4 text-default-600" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Switch
                    isSelected={cloneForm.showCredentials}
                    onValueChange={(checked: boolean) => setCloneForm(prev => ({ ...prev, showCredentials: checked }))}
                  />
                  <span className="text-sm">Private Repository (requires authentication)</span>
                </div>
                
                {cloneForm.showCredentials && (
                  <div className="space-y-3 p-4 bg-default-50 rounded-lg border border-default-200">
                    <div className="text-sm text-default-600 mb-2">
                      <strong>Tip:</strong> For GitLab, use your username and personal access token (not password)
                    </div>
                    <Input
                      label="Username"
                      placeholder="your-username"
                      value={cloneForm.credentials.username}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                        setCloneForm(prev => ({ 
                          ...prev, 
                          credentials: { ...prev.credentials, username: e.target.value }
                        }))
                      }
                      variant="bordered"
                    />
                    <Input
                      label="Password / Personal Access Token"
                      type="password"
                      placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                      value={cloneForm.credentials.password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                        setCloneForm(prev => ({ 
                          ...prev, 
                          credentials: { ...prev.credentials, password: e.target.value }
                        }))
                      }
                      variant="bordered"
                    />
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="flat" onClick={onClose}>
                Cancel
              </Button>
              <Button
                color="success"
                onClick={onClone}
                isLoading={loading}
                isDisabled={!cloneForm.repoUrl}
              >
                Clone Repository
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
} 
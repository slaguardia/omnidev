'use client';

// ClaudeTab component for managing CLAUDE.md configuration
import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Textarea } from '@heroui/input';
import { FileText, Save, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { Divider } from '@heroui/divider';
import { Switch } from '@heroui/switch';
import { addToast } from '@heroui/toast';
import ReactMarkdown from 'react-markdown';
import { Link } from '@heroui/link';
import RenderExampleModal, { EXAMPLE_CLAUDE_CONTENT } from './RenderExampleModal';
import { getClaudeMDContent } from '@/lib/claudeCode/claudemd';
import { LabelWithTooltip } from '@/components/LabelWithTooltip';

export default function ClaudeMDTab() {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [fileExists, setFileExists] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExampleModalOpen, setIsExampleModalOpen] = useState(false);

  // Load existing CLAUDE.md content on component mount
  useEffect(() => {
    const loadContent = async () => {
      try {
        setLoading(true);
        const { content, fileExists } = await getClaudeMDContent();
        setContent(content || '');
        setOriginalContent(content || '');
        setFileExists(fileExists);
      } catch (error) {
        console.error('Error loading CLAUDE.md content:', error);
        addToast({
          title: 'Error',
          description: 'Failed to load CLAUDE.md content',
          color: 'danger',
        });
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, []);

  // Track changes
  useEffect(() => {
    setHasChanges(content !== originalContent);
  }, [content, originalContent]);

  const saveClaudeContent = async (content: string) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/claude-md', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        setOriginalContent(content);
        setFileExists(true);
        addToast({
          title: 'Success',
          description: 'CLAUDE.md configuration saved successfully',
          color: 'success',
        });
      } else {
        const error = await response.json();
        addToast({
          title: 'Error',
          description: error.message || 'Failed to save CLAUDE.md configuration',
          color: 'danger',
        });
      }
    } catch (error) {
      console.error('Error saving CLAUDE.md:', error);
      addToast({
        title: 'Error',
        description: 'Failed to save CLAUDE.md configuration',
        color: 'danger',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetToOriginal = () => {
    setContent(originalContent);
  };

  const removeClaudeFile = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch('/api/claude-md', {
        method: 'DELETE',
      });

      if (response.ok) {
        setContent('');
        setOriginalContent('');
        setFileExists(false);
        addToast({
          title: 'Success',
          description: 'CLAUDE.md file removed successfully',
          color: 'success',
        });
      } else {
        const error = await response.json();
        addToast({
          title: 'Error',
          description: error.message || 'Failed to remove CLAUDE.md file',
          color: 'danger',
        });
      }
    } catch (error) {
      console.error('Error removing CLAUDE.md:', error);
      addToast({
        title: 'Error',
        description: 'Failed to remove CLAUDE.md file',
        color: 'danger',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const renderPreview = () => {
    if (!content.trim()) {
      return (
        <div className="text-center py-8 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No content to preview</p>
        </div>
      );
    }

    return (
      <div className="prose prose-sm max-w-full dark:prose-invert">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="space-y-6 w-full">
      <Card className="glass-card overflow-hidden w-full max-w-full">
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-500" />
              CLAUDE.md Configuration
            </h3>
            <div className="flex items-center gap-8">
              <Switch
                isSelected={isPreview}
                onValueChange={setIsPreview}
                startContent={<Eye className="w-4 h-4" />}
                endContent={<EyeOff className="w-4 h-4" />}
              >
                Preview
              </Switch>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4 max-w-full overflow-hidden box-border">
            <div className="space-y-3">
              <div className="max-w-full">
                <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
                  Configure the CLAUDE.md file that provides instructions to Claude AI when working
                  within your project workspaces. This file helps guide Claude&#39;s behavior and
                  capabilities within your development environment.
                </p>
                <div className="mt-2">
                  <Link
                    href="#"
                    showAnchorIcon
                    color="primary"
                    onPress={() => setIsExampleModalOpen(true)}
                    className="text-sm"
                  >
                    View Example
                  </Link>
                </div>
                {!loading && !fileExists && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 break-words">
                    ⚠️ No CLAUDE.md file exists. Create one to provide instructions to Claude AI.
                  </p>
                )}
              </div>
            </div>

            <Divider />

            {isPreview ? (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 min-h-[400px] overflow-hidden">
                {renderPreview()}
              </div>
            ) : (
              <Textarea
                labelPlacement="outside"
                label={
                  <LabelWithTooltip
                    label="CLAUDE.md Content"
                    tooltip="Use Markdown syntax to format your Claude instructions"
                  />
                }
                value={content}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContent(e.target.value)}
                minRows={20}
                maxRows={30}
                variant="bordered"
                className="text-sm w-full max-w-full"
              />
            )}

            <div className="space-y-3 pt-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  color="primary"
                  onPress={async () => await saveClaudeContent(content)}
                  isLoading={isSaving}
                  isDisabled={!hasChanges || loading || !content.trim()}
                  startContent={<Save className="w-4 h-4" />}
                >
                  Save Configuration
                </Button>

                {hasChanges && (
                  <Button
                    color="default"
                    variant="ghost"
                    onPress={resetToOriginal}
                    isDisabled={loading}
                    startContent={<RotateCcw className="w-4 h-4" />}
                  >
                    Reset Changes
                  </Button>
                )}

                {fileExists && (
                  <Button
                    color="danger"
                    variant="ghost"
                    onPress={removeClaudeFile}
                    isLoading={isDeleting}
                    isDisabled={loading}
                    startContent={<RotateCcw className="w-4 h-4" />}
                  >
                    Remove File
                  </Button>
                )}
              </div>

              {hasChanges && (
                <div className="text-center">
                  <span className="text-sm text-warning-500 font-medium">Unsaved changes</span>
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <RenderExampleModal
        saveClaudeContent={async () => await saveClaudeContent(EXAMPLE_CLAUDE_CONTENT)}
        isExampleModalOpen={isExampleModalOpen}
        setIsExampleModalOpen={setIsExampleModalOpen}
        setContent={setContent}
      />
    </div>
  );
}

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Input, Textarea } from '@heroui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  MessageSquarePlus,
  Send,
  Pencil,
  BookOpen,
  Trash2,
  ListTree,
  Plus,
} from 'lucide-react';
import type { GeneratedStoryPreview } from '@/lib/managers/ralph-task-manager';

export interface StoriesModalProps {
  isOpen: boolean;
  taskId: string | null;
  taskTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function StoriesModal({
  isOpen,
  taskId,
  taskTitle,
  onClose,
  onSuccess,
}: StoriesModalProps) {
  const [stories, setStories] = useState<GeneratedStoryPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [isRevisionMode, setIsRevisionMode] = useState(false);
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'title' | 'userStory' | 'ac' | null>(null);

  // Fetch stories when modal opens
  useEffect(() => {
    if (!isOpen || !taskId) return;

    setError(null);
    setLoading(true);
    setStories([]);
    setIsRevisionMode(false);
    setRevisionFeedback('');
    setEditingStoryId(null);
    setEditingField(null);

    fetch(`/api/ralph/tasks/${taskId}/stories`)
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setStories(data.stories || []);
      })
      .catch((err) => {
        console.error('[STORIES MODAL] Failed to fetch stories:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch stories');
      })
      .finally(() => setLoading(false));
  }, [isOpen, taskId]);

  const handleClose = useCallback(() => {
    setStories([]);
    setError(null);
    setRevisionFeedback('');
    setIsRevisionMode(false);
    setEditingStoryId(null);
    setEditingField(null);
    onClose();
  }, [onClose]);

  const handleUpdateStory = useCallback(
    (storyId: string, updates: Partial<GeneratedStoryPreview>) => {
      setStories((prev) =>
        prev.map((story) => (story.tempId === storyId ? { ...story, ...updates } : story))
      );
    },
    []
  );

  const handleDeleteStory = useCallback((storyId: string) => {
    setStories((prev) => {
      const filtered = prev.filter((story) => story.tempId !== storyId);
      return filtered.map((story, index) => ({ ...story, order: index + 1 }));
    });
  }, []);

  const handleAddStory = useCallback(() => {
    const newStory: GeneratedStoryPreview = {
      tempId: `preview-${Date.now()}-manual`,
      title: `US-${String(stories.length + 1).padStart(3, '0')}: New Story`,
      userStory: 'As a user, I want [action] so that [benefit]',
      acceptanceCriteria: ['Acceptance criteria 1'],
      order: stories.length + 1,
    };
    setStories((prev) => [...prev, newStory]);
    setEditingStoryId(newStory.tempId);
    setEditingField('title');
  }, [stories.length]);

  const handleReorderStory = useCallback((storyId: string, direction: 'up' | 'down') => {
    setStories((prev) => {
      const index = prev.findIndex((s) => s.tempId === storyId);
      if (index === -1) return prev;

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;

      const newStories = [...prev];
      const temp = newStories[index];
      const swapTarget = newStories[newIndex];
      if (temp && swapTarget) {
        newStories[index] = swapTarget;
        newStories[newIndex] = temp;
      }

      return newStories.map((story, i) => ({ ...story, order: i + 1 }));
    });
  }, []);

  const handleApproveStories = useCallback(async () => {
    if (!taskId || stories.length === 0) return;

    console.log('[STORIES MODAL] Approving stories for task:', taskId);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ralph/tasks/${taskId}/stories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          stories,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      handleClose();
      onSuccess();
    } catch (err) {
      console.error('[STORIES MODAL] Failed to approve stories:', err);
      setError(err instanceof Error ? err.message : 'Failed to approve stories');
    } finally {
      setLoading(false);
    }
  }, [taskId, stories, handleClose, onSuccess]);

  const handleRequestRevision = useCallback(async () => {
    if (!taskId || !revisionFeedback.trim()) return;

    console.log('[STORIES MODAL] Requesting story revision for task:', taskId);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ralph/tasks/${taskId}/stories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revision',
          feedback: revisionFeedback,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      handleClose();
      onSuccess();
    } catch (err) {
      console.error('[STORIES MODAL] Failed to request revision:', err);
      setError(err instanceof Error ? err.message : 'Failed to request revision');
    } finally {
      setLoading(false);
    }
  }, [taskId, revisionFeedback, handleClose, onSuccess]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      size="2xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onCloseModal) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <ListTree className="w-5 h-5 text-secondary" />
                <span>Review Generated Stories</span>
              </div>
              <p className="text-sm font-normal text-default-500">{taskTitle}</p>
            </ModalHeader>
            <ModalBody>
              {loading && stories.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : error && stories.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <AlertTriangle className="w-12 h-12 text-danger" />
                  <p className="text-danger text-center">{error}</p>
                </div>
              ) : isRevisionMode ? (
                <div className="space-y-4">
                  <p className="text-default-600">
                    Provide feedback for the planning agent to revise the story breakdown. Be
                    specific about what needs to change.
                  </p>
                  <Textarea
                    label="Revision Feedback"
                    placeholder="E.g., 'Split story 3 into smaller pieces', 'Add error handling stories', 'Combine stories 1 and 2'"
                    value={revisionFeedback}
                    onValueChange={setRevisionFeedback}
                    minRows={4}
                    maxRows={8}
                  />
                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-danger-50 border border-danger-200 rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
                      <p className="text-danger text-sm">{error}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {stories.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-8 text-default-400">
                      <BookOpen className="w-12 h-12" />
                      <p>No stories generated from the planning output.</p>
                      <p className="text-sm">
                        Add stories manually or request a revision to regenerate.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-default-600 text-sm">
                        Review and edit the generated stories before creating them as tasks. You can
                        reorder, delete, or add stories.
                      </p>
                      {stories.map((story, index) => (
                        <div
                          key={story.tempId}
                          className="border border-default-200 rounded-lg p-4 space-y-3 hover:border-default-300 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex flex-col gap-1 items-center">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                isDisabled={index === 0}
                                onPress={() => handleReorderStory(story.tempId, 'up')}
                              >
                                <ChevronUp className="w-4 h-4" />
                              </Button>
                              <span className="text-xs text-default-400 font-mono">
                                #{story.order}
                              </span>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                isDisabled={index === stories.length - 1}
                                onPress={() => handleReorderStory(story.tempId, 'down')}
                              >
                                <ChevronDown className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="flex-1 min-w-0 space-y-2">
                              {/* Title */}
                              {editingStoryId === story.tempId && editingField === 'title' ? (
                                <Input
                                  size="sm"
                                  value={story.title}
                                  onValueChange={(val) =>
                                    handleUpdateStory(story.tempId, { title: val })
                                  }
                                  onBlur={() => {
                                    setEditingStoryId(null);
                                    setEditingField(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      setEditingStoryId(null);
                                      setEditingField(null);
                                    }
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <div
                                  className="font-medium text-sm cursor-pointer hover:bg-default-100 px-2 py-1 rounded -mx-2"
                                  onClick={() => {
                                    setEditingStoryId(story.tempId);
                                    setEditingField('title');
                                  }}
                                >
                                  {story.title}
                                  <Pencil className="w-3 h-3 inline ml-2 opacity-0 group-hover:opacity-50" />
                                </div>
                              )}

                              {/* User Story */}
                              {editingStoryId === story.tempId && editingField === 'userStory' ? (
                                <Textarea
                                  size="sm"
                                  value={story.userStory}
                                  onValueChange={(val) =>
                                    handleUpdateStory(story.tempId, { userStory: val })
                                  }
                                  onBlur={() => {
                                    setEditingStoryId(null);
                                    setEditingField(null);
                                  }}
                                  minRows={2}
                                  autoFocus
                                />
                              ) : (
                                <div
                                  className="text-sm text-default-600 italic cursor-pointer hover:bg-default-100 px-2 py-1 rounded -mx-2"
                                  onClick={() => {
                                    setEditingStoryId(story.tempId);
                                    setEditingField('userStory');
                                  }}
                                >
                                  {story.userStory}
                                </div>
                              )}

                              {/* Acceptance Criteria */}
                              <div className="space-y-1">
                                <div className="text-xs text-default-400 font-medium">
                                  Acceptance Criteria:
                                </div>
                                {editingStoryId === story.tempId && editingField === 'ac' ? (
                                  <Textarea
                                    size="sm"
                                    value={story.acceptanceCriteria.join('\n')}
                                    onValueChange={(val) =>
                                      handleUpdateStory(story.tempId, {
                                        acceptanceCriteria: val.split('\n').filter((l) => l.trim()),
                                      })
                                    }
                                    onBlur={() => {
                                      setEditingStoryId(null);
                                      setEditingField(null);
                                    }}
                                    minRows={3}
                                    placeholder="One criterion per line"
                                    autoFocus
                                  />
                                ) : (
                                  <ul
                                    className="list-disc list-inside text-sm text-default-600 cursor-pointer hover:bg-default-100 px-2 py-1 rounded -mx-2"
                                    onClick={() => {
                                      setEditingStoryId(story.tempId);
                                      setEditingField('ac');
                                    }}
                                  >
                                    {story.acceptanceCriteria.length > 0 ? (
                                      story.acceptanceCriteria.map((ac, acIndex) => (
                                        <li key={acIndex}>{ac}</li>
                                      ))
                                    ) : (
                                      <li className="text-default-400 italic">
                                        Click to add acceptance criteria
                                      </li>
                                    )}
                                  </ul>
                                )}
                              </div>
                            </div>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              color="danger"
                              onPress={() => handleDeleteStory(story.tempId)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Story Button */}
                  <Button
                    variant="flat"
                    color="secondary"
                    startContent={<Plus className="w-4 h-4" />}
                    onPress={handleAddStory}
                    className="w-full"
                  >
                    Add Story Manually
                  </Button>

                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-danger-50 border border-danger-200 rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
                      <p className="text-danger text-sm">{error}</p>
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter className="flex justify-between">
              <div>
                {!isRevisionMode && (
                  <Button
                    variant="flat"
                    color="warning"
                    onPress={() => setIsRevisionMode(true)}
                    startContent={<MessageSquarePlus className="w-4 h-4" />}
                    isDisabled={loading}
                  >
                    Request Revision
                  </Button>
                )}
                {isRevisionMode && (
                  <Button
                    variant="light"
                    onPress={() => {
                      setIsRevisionMode(false);
                      setRevisionFeedback('');
                    }}
                    isDisabled={loading}
                  >
                    Back to Preview
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="light" onPress={onCloseModal} isDisabled={loading}>
                  Cancel
                </Button>
                {isRevisionMode ? (
                  <Button
                    color="warning"
                    onPress={handleRequestRevision}
                    isLoading={loading}
                    isDisabled={!revisionFeedback.trim() || loading}
                    startContent={!loading && <Send className="w-4 h-4" />}
                  >
                    Send Revision Request
                  </Button>
                ) : (
                  <Button
                    color="success"
                    onPress={handleApproveStories}
                    isLoading={loading}
                    isDisabled={stories.length === 0 || loading}
                    startContent={!loading && <CheckCircle className="w-4 h-4" />}
                  >
                    Approve & Create {stories.length} Stories
                  </Button>
                )}
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

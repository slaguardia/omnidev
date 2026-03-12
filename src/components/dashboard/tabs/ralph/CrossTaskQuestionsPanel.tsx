'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Button, ButtonGroup } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Input } from '@heroui/input';
import {
  ChevronDown,
  ChevronUp,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  MessageCircleQuestion,
  Send,
  ExternalLink,
  PanelTopClose,
  PanelTopOpen,
  Filter,
} from 'lucide-react';
import { usePersistedState } from '@/hooks';
import type { PlanningQuestion } from '@/lib/managers/ralph-task-manager';
import { formatRelativeTime } from './index';
import type { RalphTaskData } from './types';

/**
 * Question with task context for the cross-task questions panel
 */
interface QuestionWithTask {
  taskId: string;
  taskTitle: string;
  workspaceId: string;
  workspaceName: string;
  question: PlanningQuestion;
}

/**
 * Filter options for the cross-task questions panel
 */
type QuestionsFilter = 'all' | 'unanswered';

/**
 * Props for CrossTaskQuestionsPanel component
 */
export interface CrossTaskQuestionsPanelProps {
  tasks: RalphTaskData[];
  onAnswerQuestion: (taskId: string, questionId: string, answer: string) => Promise<void>;
  onJumpToTask: (taskId: string) => void;
  onContinuePlanning: (taskId: string) => Promise<void>;
  workspaceFilter: string | null;
}

/**
 * CrossTaskQuestionsPanel - Dedicated panel for managing questions across all tasks
 * Shows all pending questions grouped by task with filtering and bulk answer capabilities
 */
export default function CrossTaskQuestionsPanel({
  tasks,
  onAnswerQuestion,
  onJumpToTask,
  onContinuePlanning,
  workspaceFilter,
}: CrossTaskQuestionsPanelProps) {
  const [isExpanded, setIsExpanded] = usePersistedState('ralphBoard.questionsPanel.expanded', true);
  const [filter, setFilter] = useState<QuestionsFilter>('unanswered');
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());
  const [continuingIds, setContinuingIds] = useState<Set<string>>(new Set());

  // Collect all questions from all tasks with context
  const allQuestionsWithTask = useMemo((): QuestionWithTask[] => {
    const questions: QuestionWithTask[] = [];

    tasks
      .filter((task) => !workspaceFilter || task.workspaceId === workspaceFilter)
      .forEach((task) => {
        if (task.pendingQuestions && task.pendingQuestions.length > 0) {
          task.pendingQuestions.forEach((question) => {
            questions.push({
              taskId: task.id,
              taskTitle: task.title,
              workspaceId: task.workspaceId,
              workspaceName: task.workspaceName,
              question,
            });
          });
        }
      });

    // Sort by task, then by question order
    return questions;
  }, [tasks, workspaceFilter]);

  // Filter questions based on filter selection
  const filteredQuestions = useMemo(() => {
    if (filter === 'unanswered') {
      return allQuestionsWithTask.filter((q) => !q.question.answer);
    }
    return allQuestionsWithTask;
  }, [allQuestionsWithTask, filter]);

  // Group questions by task
  const questionsByTask = useMemo(() => {
    const grouped = new Map<string, QuestionWithTask[]>();
    filteredQuestions.forEach((q) => {
      const existing = grouped.get(q.taskId);
      if (existing) {
        existing.push(q);
      } else {
        grouped.set(q.taskId, [q]);
      }
    });
    return grouped;
  }, [filteredQuestions]);

  // Counts
  const totalPending = allQuestionsWithTask.filter((q) => !q.question.answer).length;
  const totalAnswered = allQuestionsWithTask.filter((q) => q.question.answer).length;

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswerInputs((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmitAnswer = async (taskId: string, questionId: string) => {
    const answer = answerInputs[questionId]?.trim();
    if (!answer) return;

    const submitKey = `${taskId}-${questionId}`;
    setSubmittingIds((prev) => new Set(prev).add(submitKey));

    try {
      await onAnswerQuestion(taskId, questionId, answer);
      // Clear input on success
      setAnswerInputs((prev) => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
    } finally {
      setSubmittingIds((prev) => {
        const updated = new Set(prev);
        updated.delete(submitKey);
        return updated;
      });
    }
  };

  const handleContinuePlanning = async (taskId: string) => {
    setContinuingIds((prev) => new Set(prev).add(taskId));
    try {
      await onContinuePlanning(taskId);
    } finally {
      setContinuingIds((prev) => {
        const updated = new Set(prev);
        updated.delete(taskId);
        return updated;
      });
    }
  };

  // Don't render if no questions across all tasks
  if (allQuestionsWithTask.length === 0) {
    return null;
  }

  return (
    <Card className="glass-card-static mb-6">
      {/* Collapsible Header */}
      <CardHeader
        className="cursor-pointer hover:bg-content2/50 transition-colors py-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <PanelTopClose className="w-5 h-5 text-warning-500" />
            ) : (
              <PanelTopOpen className="w-5 h-5 text-warning-500" />
            )}
            <span className="font-semibold">Questions Panel</span>
            {totalPending > 0 && (
              <Chip size="sm" color="warning" variant="flat">
                {totalPending} pending
              </Chip>
            )}
            {totalAnswered > 0 && !isExpanded && (
              <Chip size="sm" color="success" variant="flat">
                {totalAnswered} answered
              </Chip>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-default-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-default-400" />
            )}
          </div>
        </div>
      </CardHeader>

      {/* Expandable Content */}
      {isExpanded && (
        <CardBody className="pt-0">
          {/* Filter Toolbar */}
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-divider">
            <Filter className="w-4 h-4 text-default-400" />
            <ButtonGroup size="sm">
              <Button
                variant={filter === 'unanswered' ? 'solid' : 'bordered'}
                color={filter === 'unanswered' ? 'warning' : 'default'}
                onPress={() => setFilter('unanswered')}
              >
                Unanswered ({totalPending})
              </Button>
              <Button
                variant={filter === 'all' ? 'solid' : 'bordered'}
                color={filter === 'all' ? 'primary' : 'default'}
                onPress={() => setFilter('all')}
              >
                All ({allQuestionsWithTask.length})
              </Button>
            </ButtonGroup>
          </div>

          {/* Questions List - Grouped by Task */}
          {filteredQuestions.length === 0 ? (
            <div className="text-center py-6 text-default-500">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-success-500" />
              <p>All questions have been answered!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(questionsByTask.entries()).map(([taskId, taskQuestions]) => {
                const firstQuestion = taskQuestions[0];
                if (!firstQuestion) return null;

                return (
                  <div key={taskId} className="border border-divider rounded-lg overflow-hidden">
                    {/* Task Header */}
                    <div className="flex items-center justify-between p-3 bg-content2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <MessageCircleQuestion className="w-4 h-4 text-warning-500 flex-shrink-0" />
                        <span className="font-medium text-sm truncate">
                          {firstQuestion.taskTitle}
                        </span>
                        <Chip size="sm" variant="flat" color="default" className="flex-shrink-0">
                          {firstQuestion.workspaceName}
                        </Chip>
                        <Chip size="sm" variant="flat" color="warning" className="flex-shrink-0">
                          {taskQuestions.filter((q) => !q.question.answer).length} pending
                        </Chip>
                      </div>
                      <Button
                        size="sm"
                        variant="light"
                        color="primary"
                        startContent={<ExternalLink className="w-3 h-3" />}
                        onPress={() => onJumpToTask(taskId)}
                        className="flex-shrink-0"
                      >
                        View Task
                      </Button>
                    </div>

                    {/* Questions for this Task */}
                    <div className="p-3 space-y-3">
                      {taskQuestions.map((item, qIndex) => {
                        const isAnswered = !!item.question.answer;
                        const submitKey = `${taskId}-${item.question.id}`;
                        const isSubmitting = submittingIds.has(submitKey);

                        return (
                          <div
                            key={item.question.id}
                            className={`p-3 rounded-lg border ${
                              isAnswered
                                ? 'bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/30'
                                : 'bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/30'
                            }`}
                          >
                            {/* Question Header */}
                            <div className="flex items-start gap-2">
                              <span
                                className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                  isAnswered
                                    ? 'text-success-600 bg-success-100 dark:bg-success-500/20'
                                    : 'text-warning-600 bg-warning-100 dark:bg-warning-500/20'
                                }`}
                              >
                                Q{qIndex + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{item.question.question}</p>
                                {item.question.context && (
                                  <p className="text-xs text-default-500 mt-1">
                                    {item.question.context}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Answer Section */}
                            {isAnswered ? (
                              <div className="mt-2 ml-6">
                                <p className="text-sm font-medium text-success-700 dark:text-success-400">
                                  A: {item.question.answer}
                                </p>
                                {item.question.answeredAt && (
                                  <p className="text-xs text-default-400 mt-1">
                                    Answered {formatRelativeTime(item.question.answeredAt)}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="mt-2 ml-6 space-y-2">
                                {/* Options if available */}
                                {item.question.options && item.question.options.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {item.question.options.map((option, optIdx) => (
                                      <Button
                                        key={optIdx}
                                        size="sm"
                                        variant="flat"
                                        color="default"
                                        className="text-xs"
                                        onPress={() => handleAnswerChange(item.question.id, option)}
                                      >
                                        {option}
                                      </Button>
                                    ))}
                                  </div>
                                )}

                                {/* Answer Input */}
                                <div className="flex gap-2">
                                  <Input
                                    size="sm"
                                    placeholder="Type your answer..."
                                    value={answerInputs[item.question.id] || ''}
                                    onChange={(e) =>
                                      handleAnswerChange(item.question.id, e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmitAnswer(taskId, item.question.id);
                                      }
                                    }}
                                    variant="bordered"
                                    className="flex-1"
                                  />
                                  <Button
                                    size="sm"
                                    color="primary"
                                    isIconOnly
                                    isLoading={isSubmitting}
                                    isDisabled={!answerInputs[item.question.id]?.trim()}
                                    onPress={() => handleSubmitAnswer(taskId, item.question.id)}
                                  >
                                    <Send className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Continue with Unanswered Questions button */}
                      {taskQuestions.some((q) => !q.question.answer) && (
                        <div className="pt-2 mt-2 border-t border-divider">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-warning-500" />
                              <span className="text-xs text-warning-600 dark:text-warning-400">
                                {taskQuestions.filter((q) => !q.question.answer).length} question
                                {taskQuestions.filter((q) => !q.question.answer).length !== 1
                                  ? 's'
                                  : ''}{' '}
                                unanswered
                              </span>
                            </div>
                            <Button
                              size="sm"
                              color="warning"
                              variant="flat"
                              startContent={<ArrowRight className="w-3 h-3" />}
                              isLoading={continuingIds.has(taskId)}
                              onPress={() => handleContinuePlanning(taskId)}
                            >
                              Continue with Unanswered
                            </Button>
                          </div>
                          <p className="text-xs text-default-500 mt-1">
                            Planning will continue without answers to pending questions.
                            {taskQuestions.filter((q) => q.question.answer).length > 0 && (
                              <span className="ml-1 text-success-600 dark:text-success-400">
                                {taskQuestions.filter((q) => q.question.answer).length} answer
                                {taskQuestions.filter((q) => q.question.answer).length !== 1
                                  ? 's'
                                  : ''}{' '}
                                will be included.
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      )}
    </Card>
  );
}

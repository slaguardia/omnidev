'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Code } from 'lucide-react';
import { Input } from '@heroui/input';
import { Select, SelectItem } from '@heroui/select';
import { Divider } from '@heroui/divider';
import { Snippet } from '@heroui/snippet';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Chip } from '@heroui/chip';
import { Workspace } from '@/lib/dashboard/types';
import { useBranches } from '@/hooks';

interface SnippetsTabProps {
  workspaces: Workspace[];
  getProjectDisplayName: (repoUrl: string) => string;
}

export default function SnippetsTab({ workspaces, getProjectDisplayName }: SnippetsTabProps) {
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [integrationApiKey, setIntegrationApiKey] = useState<string>('');
  const [integrationWorkspaceId, setIntegrationWorkspaceId] = useState<string>('');
  const [integrationSourceBranch, setIntegrationSourceBranch] = useState<string>('');
  const [integrationQuestion, setIntegrationQuestion] = useState<string>('');
  const [integrationContext, setIntegrationContext] = useState<string>('');
  const [integrationCreateMR, setIntegrationCreateMR] = useState<boolean>(false);
  const [callbackUrl, setCallbackUrl] = useState<string>('');
  const [callbackSecret, setCallbackSecret] = useState<string>('');

  const { branches, loading: loadingBranches, fetchBranches } = useBranches();

  useEffect(() => {
    // Prefer runtime origin so the copied URLs match the user's current environment.
    setBaseUrl(window.location.origin);
  }, []);

  useEffect(() => {
    const workspaceId = integrationWorkspaceId.trim();
    if (workspaceId) {
      fetchBranches(workspaceId);
    } else {
      setIntegrationSourceBranch('');
    }
  }, [integrationWorkspaceId, fetchBranches]);

  const effectiveApiKey = useMemo(() => {
    const trimmedEntered = integrationApiKey.trim();
    if (trimmedEntered) return trimmedEntered;
    return 'YOUR_API_KEY';
  }, [integrationApiKey]);

  const askUrl = useMemo(() => `${baseUrl || 'http://localhost:3000'}/api/ask`, [baseUrl]);
  const editUrl = useMemo(() => `${baseUrl || 'http://localhost:3000'}/api/edit`, [baseUrl]);
  const jobsUrl = useMemo(() => `${baseUrl || 'http://localhost:3000'}/api/jobs`, [baseUrl]);

  const askBody = useMemo(() => {
    const workspaceIdValue = integrationWorkspaceId.trim() || 'YOUR_WORKSPACE_ID';
    const questionValue = integrationQuestion.trim() || 'YOUR_QUESTION';
    const body: Record<string, unknown> = {
      workspaceId: workspaceIdValue,
      question: questionValue,
    };
    if (integrationContext.trim().length > 0) body.context = integrationContext;
    if (integrationSourceBranch.trim().length > 0)
      body.sourceBranch = integrationSourceBranch.trim();
    if (callbackUrl.trim().length > 0) {
      const cb: Record<string, string> = { url: callbackUrl.trim() };
      if (callbackSecret.trim().length > 0) cb.secret = callbackSecret.trim();
      body.callback = cb;
    }
    return JSON.stringify(body, null, 2);
  }, [
    callbackSecret,
    callbackUrl,
    integrationContext,
    integrationQuestion,
    integrationSourceBranch,
    integrationWorkspaceId,
  ]);

  const editBody = useMemo(() => {
    const workspaceIdValue = integrationWorkspaceId.trim() || 'YOUR_WORKSPACE_ID';
    const questionValue = integrationQuestion.trim() || 'YOUR_QUESTION';
    const body: Record<string, unknown> = {
      workspaceId: workspaceIdValue,
      question: questionValue,
    };
    if (integrationContext.trim().length > 0) body.context = integrationContext;
    if (integrationSourceBranch.trim().length > 0)
      body.sourceBranch = integrationSourceBranch.trim();
    // createMR is optional (defaults false) - only include when true
    if (integrationCreateMR) body.createMR = true;
    if (callbackUrl.trim().length > 0) {
      const cb: Record<string, string> = { url: callbackUrl.trim() };
      if (callbackSecret.trim().length > 0) cb.secret = callbackSecret.trim();
      body.callback = cb;
    }
    return JSON.stringify(body, null, 2);
  }, [
    callbackSecret,
    callbackUrl,
    integrationContext,
    integrationCreateMR,
    integrationQuestion,
    integrationSourceBranch,
    integrationWorkspaceId,
  ]);

  const curlAsk = useMemo(() => {
    return [
      `curl -X POST "${askUrl}" \\`,
      `  -H "Authorization: Bearer ${effectiveApiKey}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${askBody.replace(/\n/g, '\n')}'`,
    ].join('\n');
  }, [askBody, askUrl, effectiveApiKey]);

  const curlEdit = useMemo(() => {
    return [
      `curl -X POST "${editUrl}" \\`,
      `  -H "Authorization: Bearer ${effectiveApiKey}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${editBody.replace(/\n/g, '\n')}'`,
    ].join('\n');
  }, [editBody, editUrl, effectiveApiKey]);

  const curlDeleteJob = useMemo(() => {
    return `curl -X DELETE "${jobsUrl}/YOUR_JOB_ID" -H "Authorization: Bearer ${effectiveApiKey}"`;
  }, [effectiveApiKey, jobsUrl]);

  const n8nAskConfig = useMemo(() => {
    const cfg = {
      method: 'POST',
      url: askUrl,
      headers: {
        Authorization: `Bearer ${effectiveApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.parse(askBody) as Record<string, unknown>,
    };
    return JSON.stringify(cfg, null, 2);
  }, [askBody, askUrl, effectiveApiKey]);

  const selectedWorkspaceKeys = useMemo(() => {
    const trimmed = integrationWorkspaceId.trim();
    return trimmed ? [trimmed] : [];
  }, [integrationWorkspaceId]);

  const selectedSourceBranchKeys = useMemo(() => {
    if (!integrationWorkspaceId.trim()) return [];
    return [integrationSourceBranch || '__default__'];
  }, [integrationSourceBranch, integrationWorkspaceId]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Code className="w-6 h-6 text-default-500" />
          Snippets (n8n, curl, scripts)
        </h2>
      </div>

      <section className="space-y-5">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-default-700">Inputs</h3>
          <p className="text-sm text-default-600">
            Pick a workspace, fill the request fields, then copy the generated snippets below.
          </p>
        </div>
        <Divider />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          <Card className="glass-card-static">
            <CardHeader className="px-4 py-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-default-700 dark:text-default-500">
                    Connection
                  </h4>
                  <Chip size="sm" variant="flat" color="primary">
                    API
                  </Chip>
                </div>
                <p className="text-xs text-default-500">
                  Base URL defaults to your current browser URL.
                </p>
              </div>
            </CardHeader>
            <CardBody className="px-4 py-5">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-default-700">Base URL</label>
                  <Input
                    size="sm"
                    value={baseUrl}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setBaseUrl(e.target.value)
                    }
                    variant="bordered"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-default-700">API Key (optional)</label>
                  <Input
                    size="sm"
                    type="password"
                    value={integrationApiKey}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setIntegrationApiKey(e.target.value)
                    }
                    variant="bordered"
                    autoComplete="off"
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="glass-card-static">
            <CardHeader className="px-4 py-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-default-700 dark:text-default-500">Target</h4>
                  <Chip size="sm" variant="flat" color="success">
                    Workspace
                  </Chip>
                </div>
                <p className="text-xs text-default-500">Select a workspace to target requests.</p>
              </div>
            </CardHeader>
            <CardBody className="px-4 py-5">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-default-700">Workspace</label>
                  <Select
                    size="md"
                    placeholder={
                      workspaces.length > 0 ? 'Select a workspace' : 'No workspaces found'
                    }
                    selectedKeys={selectedWorkspaceKeys}
                    onSelectionChange={(keys: React.Key | Set<React.Key>) => {
                      const keyArray = Array.from(keys as Set<React.Key>);
                      setIntegrationWorkspaceId((keyArray[0] as string) || '');
                    }}
                    variant="bordered"
                    isDisabled={workspaces.length === 0}
                  >
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id}>
                        {getProjectDisplayName(workspace.repoUrl)}
                      </SelectItem>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-default-700">
                    Source Branch (optional)
                  </label>
                  <Select
                    size="md"
                    placeholder={
                      !integrationWorkspaceId.trim()
                        ? 'Select a workspace first'
                        : loadingBranches
                          ? 'Loading branches...'
                          : 'Select source branch'
                    }
                    selectedKeys={selectedSourceBranchKeys}
                    onSelectionChange={
                      integrationWorkspaceId.trim()
                        ? (keys: React.Key | Set<React.Key>) => {
                            const keyArray = Array.from(keys as Set<React.Key>);
                            const selectedKey = keyArray[0] as string | undefined;
                            if (!selectedKey || selectedKey === '__default__') {
                              setIntegrationSourceBranch('');
                              return;
                            }
                            setIntegrationSourceBranch(selectedKey);
                          }
                        : () => {}
                    }
                    variant="bordered"
                    isDisabled={!integrationWorkspaceId.trim()}
                  >
                    <>
                      {integrationWorkspaceId.trim() ? (
                        <SelectItem key="__default__">Default (workspace target branch)</SelectItem>
                      ) : null}
                      {integrationWorkspaceId.trim() && !loadingBranches
                        ? branches.map((branch) => <SelectItem key={branch}>{branch}</SelectItem>)
                        : null}
                    </>
                  </Select>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="glass-card-static">
            <CardHeader className="px-4 py-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-default-700 dark:text-default-500">Request</h4>
                  <Chip size="sm" variant="flat" color="secondary">
                    Payload
                  </Chip>
                </div>
                <p className="text-xs text-default-500">Prompt + optional context / callbacks.</p>
              </div>
            </CardHeader>
            <CardBody className="px-4 py-5">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-default-700">Question / Prompt</label>
                  <Input
                    size="sm"
                    value={integrationQuestion}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setIntegrationQuestion(e.target.value)
                    }
                    variant="bordered"
                    placeholder="YOUR_QUESTION"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-default-700">Context (optional)</label>
                  <Input
                    size="sm"
                    value={integrationContext}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setIntegrationContext(e.target.value)
                    }
                    variant="bordered"
                    placeholder="(optional)"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-default-700">Edit: createMR</label>
                  <Select
                    size="md"
                    selectedKeys={[integrationCreateMR ? 'true' : 'false']}
                    onSelectionChange={(keys: React.Key | Set<React.Key>) => {
                      const keyArray = Array.from(keys as Set<React.Key>);
                      setIntegrationCreateMR(keyArray[0] === 'true');
                    }}
                    variant="bordered"
                  >
                    <SelectItem key="false">false</SelectItem>
                    <SelectItem key="true">true</SelectItem>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-default-700">
                    Callback URL (optional)
                  </label>
                  <Input
                    size="sm"
                    value={callbackUrl}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setCallbackUrl(e.target.value)
                    }
                    variant="bordered"
                    placeholder="https://n8n.example.com/webhook/workflow-job-complete"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-default-700">
                    Callback Secret (optional)
                  </label>
                  <Input
                    size="sm"
                    type="password"
                    value={callbackSecret}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setCallbackSecret(e.target.value)
                    }
                    variant="bordered"
                    placeholder="shared-secret"
                    autoComplete="off"
                  />
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="rounded-xl border border-divider/60 bg-content2/60 px-4 py-3 text-sm text-default-600">
          <div className="flex flex-wrap items-center gap-2">
            <Chip size="sm" variant="flat">
              Tips
            </Chip>
            <span>
              Blank <span className="font-mono">sourceBranch</span> defaults to the workspace target
              branch. <span className="font-mono">createMR</span> only affects{' '}
              <span className="font-mono">/api/edit</span>. Callback secret adds{' '}
              <span className="font-mono">x-workflow-signature</span>.
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-default-700">Generated snippets</h3>
          <p className="text-sm text-default-600">
            Copy only what you need — Ask and Edit are split to reduce visual overload.
          </p>
        </div>
        <Divider />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <Card className="glass-card-static">
            <CardHeader className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Ask</span>
                <Chip size="sm" variant="flat" color="primary">
                  POST
                </Chip>
                <span className="text-sm text-default-500 font-mono">/api/ask</span>
              </div>
            </CardHeader>
            <CardBody className="px-4 py-5">
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Chip size="sm" variant="flat">
                      URL
                    </Chip>
                  </div>
                  <Snippet
                    className="w-full max-w-full"
                    classNames={{
                      base: 'w-full max-w-full',
                      pre: 'whitespace-pre-wrap break-words text-base',
                    }}
                    hideSymbol
                  >
                    {askUrl}
                  </Snippet>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Chip size="sm" variant="flat">
                      curl
                    </Chip>
                  </div>
                  <Snippet
                    className="w-full max-w-full"
                    classNames={{
                      base: 'w-full max-w-full',
                      pre: 'whitespace-pre-wrap break-words text-base',
                    }}
                    hideSymbol
                  >
                    {curlAsk}
                  </Snippet>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Chip size="sm" variant="flat" color="secondary">
                      n8n JSON
                    </Chip>
                    <span className="text-sm text-default-500">HTTP Request node</span>
                  </div>
                  <Snippet
                    className="w-full max-w-full"
                    classNames={{
                      base: 'w-full max-w-full',
                      pre: 'whitespace-pre-wrap break-words text-base',
                    }}
                    hideSymbol
                  >
                    {n8nAskConfig}
                  </Snippet>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="glass-card-static">
            <CardHeader className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Edit</span>
                <Chip size="sm" variant="flat" color="warning">
                  POST
                </Chip>
                <span className="text-sm text-default-500 font-mono">/api/edit</span>
              </div>
            </CardHeader>
            <CardBody className="px-4 py-5">
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Chip size="sm" variant="flat">
                      URL
                    </Chip>
                  </div>
                  <Snippet
                    className="w-full max-w-full"
                    classNames={{
                      base: 'w-full max-w-full',
                      pre: 'whitespace-pre-wrap break-words text-base',
                    }}
                    hideSymbol
                  >
                    {editUrl}
                  </Snippet>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Chip size="sm" variant="flat">
                      curl
                    </Chip>
                  </div>
                  <Snippet
                    className="w-full max-w-full"
                    classNames={{
                      base: 'w-full max-w-full',
                      pre: 'whitespace-pre-wrap break-words text-base',
                    }}
                    hideSymbol
                  >
                    {curlEdit}
                  </Snippet>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Chip size="sm" variant="flat" color="default">
                      Job poll
                    </Chip>
                    <span className="text-sm text-default-500 font-mono">/api/jobs/:jobId</span>
                  </div>
                  <Snippet
                    className="w-full max-w-full"
                    classNames={{
                      base: 'w-full max-w-full',
                      pre: 'whitespace-pre-wrap break-words text-base',
                    }}
                    hideSymbol
                  >
                    {`curl "${jobsUrl}/YOUR_JOB_ID" -H "Authorization: Bearer ${effectiveApiKey}"`}
                  </Snippet>
                  <p className="text-sm text-default-500">
                    If the request queues, you’ll get a{' '}
                    <code className="bg-default-200 px-1 rounded">jobId</code>.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="glass-card-static xl:col-span-2">
            <CardHeader className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-default-700 dark:text-default-500">
                  Delete Job
                </span>
                <Chip size="sm" variant="flat" color="danger">
                  DELETE
                </Chip>
                <span className="text-sm text-default-500 font-mono">/api/jobs/:jobId</span>
              </div>
            </CardHeader>
            <CardBody className="px-4 py-5">
              <div className="space-y-4">
                <Snippet
                  className="w-full max-w-full"
                  classNames={{
                    base: 'w-full max-w-full',
                    pre: 'whitespace-pre-wrap break-words text-base',
                  }}
                  hideSymbol
                >
                  {curlDeleteJob}
                </Snippet>
                <p className="text-sm text-default-500">
                  Only finished jobs can be deleted (completed/failed). Pending/processing returns{' '}
                  <code className="bg-default-200 px-1 rounded">409</code>.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>
    </div>
  );
}

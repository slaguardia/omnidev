'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Switch } from "@heroui/switch";
import { Spinner } from "@heroui/spinner";

// Simple Select and Textarea components for now - we'll use native HTML elements wrapped with styling
const Select: React.FC<{
  label: string;
  placeholder: string;
  selectedKeys: string[];
  onSelectionChange: (keys: any) => void;
  variant: string;
  children: React.ReactNode;
}> = ({ label, placeholder, selectedKeys, onSelectionChange, variant, children }) => (
  <div className="flex flex-col gap-2">
    <label className="text-sm font-medium text-default-600">{label}</label>
    <select
      className="w-full p-3 border border-default-200 rounded-lg bg-background focus:border-primary-400 focus:outline-none"
      value={selectedKeys[0] || ''}
      onChange={(e) => onSelectionChange([e.target.value])}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  </div>
);

const SelectItem: React.FC<{ key: string; value: string; children: React.ReactNode }> = ({ value, children }) => (
  <option value={value}>{children}</option>
);

const Textarea: React.FC<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  variant: string;
  minRows?: number;
}> = ({ label, placeholder, value, onChange, variant, minRows = 3 }) => (
  <div className="flex flex-col gap-2">
    <label className="text-sm font-medium text-default-600">{label}</label>
    <textarea
      className="w-full p-3 border border-default-200 rounded-lg bg-background focus:border-primary-400 focus:outline-none resize-y"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={minRows}
    />
  </div>
);

const Tab: React.FC<{ key: string; title: string }> = ({ title }) => <span>{title}</span>;

const Tabs: React.FC<{
  selectedKey: string;
  onSelectionChange: (key: React.Key) => void;
  className: string;
  variant: string;
  children: React.ReactNode;
}> = ({ selectedKey, onSelectionChange, className, variant, children }) => {
  const tabs = ['overview', 'workspaces', 'operations', 'settings'];
  const tabTitles = ['Overview', 'Workspaces', 'Operations', 'Environment Config'];
  
  return (
    <div className={className}>
      <div className="border-b border-default-200">
        <nav className="flex space-x-8">
          {tabs.map((tab, index) => (
            <button
              key={tab}
              onClick={() => onSelectionChange(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                selectedKey === tab
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-default-500 hover:text-default-700 hover:border-default-300'
              }`}
            >
              {tabTitles[index]}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};

// Toast notifications - we'll implement a simple toast system
const toast = {
  success: (message: string) => console.log('SUCCESS:', message),
  error: (message: string) => console.error('ERROR:', message)
};

interface Workspace {
  id: string;
  repoUrl: string;
  branch: string;
  path: string;
  lastAccessed: Date;
  metadata?: {
    isActive: boolean;
    commitHash?: string;
    size?: number;
  };
}

interface EnvironmentConfig {
  GITLAB_URL: string;
  GITLAB_TOKEN: string;
  CLAUDE_API_KEY: string;
  CLAUDE_CODE_PATH: string;
  MAX_WORKSPACE_SIZE_MB: string;
  CACHE_EXPIRY_DAYS: string;
  TEMP_DIR_PREFIX: string;
  LOG_LEVEL: string;
  ALLOWED_GITLAB_HOSTS: string;
  MAX_CONCURRENT_WORKSPACES: string;
}

const DEFAULT_ENV_CONFIG: EnvironmentConfig = {
  GITLAB_URL: 'https://gitlab.com',
  GITLAB_TOKEN: '',
  CLAUDE_API_KEY: '',
  CLAUDE_CODE_PATH: '/usr/local/bin/claude-code',
  MAX_WORKSPACE_SIZE_MB: '1000',
  CACHE_EXPIRY_DAYS: '7',
  TEMP_DIR_PREFIX: 'gitlab-claude-',
  LOG_LEVEL: 'info',
  ALLOWED_GITLAB_HOSTS: 'gitlab.com,your-internal-gitlab.com',
  MAX_CONCURRENT_WORKSPACES: '5'
};

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [envConfig, setEnvConfig] = useState<EnvironmentConfig>(DEFAULT_ENV_CONFIG);
  
  // Form states for various operations
  const [cloneForm, setCloneForm] = useState({
    repoUrl: '',
    branch: '',
    depth: '1',
    singleBranch: false
  });
  
  const [analyzeForm, setAnalyzeForm] = useState({
    workspaceId: '',
    directory: '.',
    language: ''
  });
  
  const [claudeForm, setClaudeForm] = useState({
    workspaceId: '',
    question: '',
    context: ''
  });
  
  const [cacheForm, setCacheForm] = useState({
    workspaceId: ''
  });

  // Load environment configuration on mount
  useEffect(() => {
    loadEnvironmentConfig();
    loadWorkspaces();
  }, []);

  const loadEnvironmentConfig = async () => {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data = await response.json();
        setEnvConfig(prev => ({ ...prev, ...data.config }));
      }
    } catch (error) {
      console.error('Failed to load environment config:', error);
    }
  };

  const saveEnvironmentConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: envConfig })
      });
      
      if (response.ok) {
        toast.success('✅ Environment configuration saved!');
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (error) {
      toast.error('❌ Failed to save configuration');
      console.error('Error saving config:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkspaces = async () => {
    try {
      const response = await fetch('/api/workspaces');
      if (response.ok) {
        const data = await response.json();
        setWorkspaces(data.workspaces || []);
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    }
  };

  const handleCloneRepository = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloneForm)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast.success('✅ Repository cloned successfully!');
        setCloneForm({ repoUrl: '', branch: '', depth: '1', singleBranch: false });
        loadWorkspaces();
      } else {
        throw new Error(data.error || 'Clone failed');
      }
    } catch (error) {
      toast.error('❌ Clone failed');
      console.error('Clone error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeWorkspace = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analyzeForm)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast.success('✅ Analysis completed!');
        setAnalyzeForm({ workspaceId: '', directory: '.', language: '' });
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (error) {
      toast.error('❌ Analysis failed');
      console.error('Analysis error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAskClaude = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(claudeForm)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast.success('✅ Claude responded!');
        // You might want to display Claude's response in a modal or dedicated area
      } else {
        throw new Error(data.error || 'Claude request failed');
      }
    } catch (error) {
      toast.error('❌ Claude request failed');
      console.error('Claude error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCacheStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cache-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: cacheForm.workspaceId })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast.success('✅ Cache status retrieved!');
        // Display cache status information
      } else {
        throw new Error(data.error || 'Cache status failed');
      }
    } catch (error) {
      toast.error('❌ Cache status failed');
      console.error('Cache status error:', error);
    } finally {
      setLoading(false);
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
        toast.success('✅ Cleanup completed!');
        loadWorkspaces();
      } else {
        throw new Error(data.error || 'Cleanup failed');
      }
    } catch (error) {
      toast.error('❌ Cleanup failed');
      console.error('Cleanup error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto relative mb-16">
      {/* Blur effects for natural inset/outset */}
      <div className="absolute -inset-8 bg-gradient-to-r from-transparent via-red-50/20 to-transparent blur-xl rounded-3xl dark:via-red-950/10"></div>
      <div className="absolute -inset-4 bg-gradient-to-b from-background/60 to-background/80 rounded-2xl shadow-inner"></div>
      
      <div className="relative z-10 p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">
            <span style={{ background: 'linear-gradient(to right, #dc2626, #1e40af)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Code
            </span>
            <span style={{ background: 'linear-gradient(to right, #1e40af, #dc2626)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Spider
            </span>
            <span className="text-white">
              {" "}Dashboard
            </span>
          </h1>
          <p className="text-default-600">
            Manage your development workspaces, configure environment settings, and interact with Claude AI
          </p>
        </div>

      <Tabs 
        selectedKey={activeTab} 
        onSelectionChange={(key: React.Key) => setActiveTab(key as string)}
        className="w-full"
        variant="underlined"
      >
        <Tab key="overview" title="Overview" />
        <Tab key="workspaces" title="Workspaces" />
        <Tab key="operations" title="Operations" />
        <Tab key="settings" title="Environment Config" />
      </Tabs>

      <div className="mt-6">
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* Quick Stats */}
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="text-blue-500">📊</span>
                  Quick Stats
                </h3>
              </CardHeader>
              <CardBody>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-default-600">Active Workspaces:</span>
                    <Chip color="primary" size="sm">
                      {workspaces.filter(w => w.metadata?.isActive).length}
                    </Chip>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-default-600">Total Workspaces:</span>
                    <Chip color="default" size="sm">{workspaces.length}</Chip>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-default-600">Cache Status:</span>
                    <Chip color="success" size="sm">Healthy</Chip>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Recent Activity */}
            <Card className="glass-card md:col-span-2">
              <CardHeader className="pb-2">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="text-green-500">📈</span>
                  Recent Workspaces
                </h3>
              </CardHeader>
              <CardBody>
                <div className="space-y-3">
                  {workspaces.slice(0, 3).map((workspace) => (
                    <div key={workspace.id} className="flex items-center justify-between p-3 bg-default-50 dark:bg-default-100 rounded-lg">
                      <div>
                        <p className="font-medium">{workspace.id}</p>
                        <p className="text-sm text-default-600">{workspace.repoUrl}</p>
                      </div>
                      <Chip 
                        color={workspace.metadata?.isActive ? "success" : "default"}
                        size="sm"
                      >
                        {workspace.metadata?.isActive ? "Active" : "Inactive"}
                      </Chip>
                    </div>
                  ))}
                  {workspaces.length === 0 && (
                    <p className="text-default-600 text-center py-4">No workspaces yet. Clone a repository to get started!</p>
                  )}
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {activeTab === "workspaces" && (
          <div className="space-y-6">
            {/* Workspace List */}
            <Card className="glass-card">
              <CardHeader className="flex justify-between items-center">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="text-blue-500">📋</span>
                  All Workspaces
                </h3>
                <Button 
                  color="primary" 
                  size="sm"
                  onClick={loadWorkspaces}
                  isLoading={loading}
                >
                  Refresh
                </Button>
              </CardHeader>
              <CardBody>
                <div className="space-y-4">
                  {workspaces.map((workspace) => (
                    <div key={workspace.id} className="p-4 border border-default-200 rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-lg">{workspace.id}</h4>
                          <p className="text-default-600">{workspace.repoUrl}</p>
                          <p className="text-sm text-default-500">Branch: {workspace.branch}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Chip 
                            color={workspace.metadata?.isActive ? "success" : "default"}
                            size="sm"
                          >
                            {workspace.metadata?.isActive ? "Active" : "Inactive"}
                          </Chip>
                          <Button
                            color="danger"
                            size="sm"
                            variant="flat"
                            onClick={() => handleCleanupWorkspace(workspace.id)}
                            isLoading={loading}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="text-sm text-default-600">
                        <p>Path: {workspace.path}</p>
                        <p>Last accessed: {new Date(workspace.lastAccessed).toLocaleString()}</p>
                        {workspace.metadata?.commitHash && (
                          <p>Commit: {workspace.metadata.commitHash.slice(0, 8)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {workspaces.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-default-600 mb-4">No workspaces found</p>
                      <Button color="primary" onClick={() => setActiveTab("operations")}>
                        Clone your first repository
                      </Button>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            {/* Bulk Actions */}
            <Card className="glass-card">
              <CardHeader>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="text-warning-500">🧹</span>
                  Bulk Actions
                </h3>
              </CardHeader>
              <CardBody>
                <div className="flex gap-4">
                  <Button
                    color="warning"
                    onClick={() => handleCleanupWorkspace(undefined, true)}
                    isLoading={loading}
                  >
                    Clean All Inactive
                  </Button>
                  <Button
                    color="danger"
                    variant="flat"
                    onClick={() => {
                      if (confirm('This will delete ALL workspaces. Are you sure?')) {
                        handleCleanupWorkspace(undefined, true);
                      }
                    }}
                    isLoading={loading}
                  >
                    Delete All
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {activeTab === "operations" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Clone Repository */}
            <Card className="glass-card">
              <CardHeader>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="text-green-500">🔄</span>
                  Clone Repository
                </h3>
              </CardHeader>
              <CardBody>
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
                      <Switch
                        isSelected={cloneForm.singleBranch}
                        onValueChange={(checked: boolean) => setCloneForm(prev => ({ ...prev, singleBranch: checked }))}
                      />
                      <span className="text-sm">Single Branch</span>
                    </div>
                  </div>
                  <Button
                    color="success"
                    className="w-full"
                    onClick={handleCloneRepository}
                    isLoading={loading}
                  >
                    Clone Repository
                  </Button>
                </div>
              </CardBody>
            </Card>

            {/* Analyze Workspace */}
            <Card className="glass-card">
              <CardHeader>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="text-red-500">🔍</span>
                  Analyze Workspace
                </h3>
              </CardHeader>
              <CardBody>
                <div className="space-y-4">
                  <Select
                    label="Workspace"
                    placeholder="Select a workspace"
                    selectedKeys={analyzeForm.workspaceId ? [analyzeForm.workspaceId] : []}
                    onSelectionChange={(keys: any) => setAnalyzeForm(prev => ({ ...prev, workspaceId: Array.from(keys)[0] as string }))}
                    variant="bordered"
                  >
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.id} - {workspace.repoUrl}
                      </SelectItem>
                    ))}
                  </Select>
                  <Input
                    label="Directory"
                    placeholder="."
                    value={analyzeForm.directory}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAnalyzeForm(prev => ({ ...prev, directory: e.target.value }))}
                    variant="bordered"
                  />
                  <Input
                    label="Language (optional)"
                    placeholder="typescript"
                    value={analyzeForm.language}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAnalyzeForm(prev => ({ ...prev, language: e.target.value }))}
                    variant="bordered"
                  />
                  <Button
                    color="secondary"
                    className="w-full"
                    onClick={handleAnalyzeWorkspace}
                    isLoading={loading}
                    isDisabled={!analyzeForm.workspaceId}
                  >
                    Analyze with Claude
                  </Button>
                </div>
              </CardBody>
            </Card>

            {/* Ask Claude */}
            <Card className="glass-card">
              <CardHeader>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="text-purple-500">🤖</span>
                  Ask Claude
                </h3>
              </CardHeader>
              <CardBody>
                <div className="space-y-4">
                  <Select
                    label="Workspace"
                    placeholder="Select a workspace"
                    selectedKeys={claudeForm.workspaceId ? [claudeForm.workspaceId] : []}
                    onSelectionChange={(keys: any) => setClaudeForm(prev => ({ ...prev, workspaceId: Array.from(keys)[0] as string }))}
                    variant="bordered"
                  >
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.id} - {workspace.repoUrl}
                      </SelectItem>
                    ))}
                  </Select>
                  <Textarea
                    label="Question"
                    placeholder="How can I optimize this code?"
                    value={claudeForm.question}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setClaudeForm(prev => ({ ...prev, question: e.target.value }))}
                    variant="bordered"
                    minRows={2}
                  />
                  <Textarea
                    label="Additional Context (optional)"
                    placeholder="I'm particularly interested in performance..."
                    value={claudeForm.context}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setClaudeForm(prev => ({ ...prev, context: e.target.value }))}
                    variant="bordered"
                    minRows={2}
                  />
                  <Button
                    color="secondary"
                    className="w-full"
                    onClick={handleAskClaude}
                    isLoading={loading}
                    isDisabled={!claudeForm.workspaceId || !claudeForm.question}
                  >
                    Ask Claude
                  </Button>
                </div>
              </CardBody>
            </Card>

            {/* Cache Status */}
            <Card className="glass-card">
              <CardHeader>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="text-cyan-500">💾</span>
                  Cache Management
                </h3>
              </CardHeader>
              <CardBody>
                <div className="space-y-4">
                  <Select
                    label="Workspace"
                    placeholder="Select a workspace"
                    selectedKeys={cacheForm.workspaceId ? [cacheForm.workspaceId] : []}
                    onSelectionChange={(keys: any) => setCacheForm(prev => ({ ...prev, workspaceId: Array.from(keys)[0] as string }))}
                    variant="bordered"
                  >
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.id} - {workspace.repoUrl}
                      </SelectItem>
                    ))}
                  </Select>
                  <div className="flex gap-2">
                    <Button
                      color="primary"
                      className="flex-1"
                      onClick={handleCacheStatus}
                      isLoading={loading}
                      isDisabled={!cacheForm.workspaceId}
                    >
                      Check Status
                    </Button>
                    <Button
                      color="warning"
                      variant="flat"
                      className="flex-1"
                      onClick={() => {
                        // Implement cache clear functionality
                        toast.success('Cache cleared!');
                      }}
                      isDisabled={!cacheForm.workspaceId}
                    >
                      Clear Cache
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="text-orange-500">⚙️</span>
                  Environment Configuration
                </h3>
              </CardHeader>
              <CardBody>
                <div className="space-y-6">
                  {/* GitLab Configuration */}
                  <div>
                    <h4 className="text-md font-semibold mb-3 text-default-700">GitLab Configuration</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="GitLab URL"
                        value={envConfig.GITLAB_URL}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, GITLAB_URL: e.target.value }))}
                        variant="bordered"
                      />
                      <Input
                        label="GitLab Token"
                        type="password"
                        value={envConfig.GITLAB_TOKEN}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, GITLAB_TOKEN: e.target.value }))}
                        variant="bordered"
                      />
                    </div>
                    <Input
                      label="Allowed GitLab Hosts"
                      value={envConfig.ALLOWED_GITLAB_HOSTS}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, ALLOWED_GITLAB_HOSTS: e.target.value }))}
                      variant="bordered"
                      className="mt-4"
                      description="Comma-separated list of allowed hosts"
                    />
                  </div>

                  <Divider />

                  {/* Claude Configuration */}
                  <div>
                    <h4 className="text-md font-semibold mb-3 text-default-700">Claude Configuration</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Claude API Key"
                        type="password"
                        value={envConfig.CLAUDE_API_KEY}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, CLAUDE_API_KEY: e.target.value }))}
                        variant="bordered"
                      />
                      <Input
                        label="Claude Code Path"
                        value={envConfig.CLAUDE_CODE_PATH}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, CLAUDE_CODE_PATH: e.target.value }))}
                        variant="bordered"
                      />
                    </div>
                  </div>

                  <Divider />

                  {/* Application Settings */}
                  <div>
                    <h4 className="text-md font-semibold mb-3 text-default-700">Application Settings</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Max Workspace Size (MB)"
                        type="number"
                        value={envConfig.MAX_WORKSPACE_SIZE_MB}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, MAX_WORKSPACE_SIZE_MB: e.target.value }))}
                        variant="bordered"
                      />
                      <Input
                        label="Cache Expiry (Days)"
                        type="number"
                        value={envConfig.CACHE_EXPIRY_DAYS}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, CACHE_EXPIRY_DAYS: e.target.value }))}
                        variant="bordered"
                      />
                      <Input
                        label="Temp Directory Prefix"
                        value={envConfig.TEMP_DIR_PREFIX}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, TEMP_DIR_PREFIX: e.target.value }))}
                        variant="bordered"
                      />
                      <Select
                        label="Log Level"
                        placeholder="Select log level"
                        selectedKeys={[envConfig.LOG_LEVEL]}
                        onSelectionChange={(keys: any) => setEnvConfig(prev => ({ ...prev, LOG_LEVEL: Array.from(keys)[0] as string }))}
                        variant="bordered"
                      >
                        <SelectItem key="error" value="error">Error</SelectItem>
                        <SelectItem key="warn" value="warn">Warning</SelectItem>
                        <SelectItem key="info" value="info">Info</SelectItem>
                        <SelectItem key="debug" value="debug">Debug</SelectItem>
                      </Select>
                      <Input
                        label="Max Concurrent Workspaces"
                        type="number"
                        value={envConfig.MAX_CONCURRENT_WORKSPACES}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, MAX_CONCURRENT_WORKSPACES: e.target.value }))}
                        variant="bordered"
                        className="md:col-span-2"
                      />
                    </div>
                  </div>

                  <Divider />

                  {/* Save Configuration */}
                  <div className="flex justify-end gap-4">
                    <Button
                      color="default"
                      variant="flat"
                      onClick={() => setEnvConfig(DEFAULT_ENV_CONFIG)}
                    >
                      Reset to Defaults
                    </Button>
                    <Button
                      color="primary"
                      onClick={saveEnvironmentConfig}
                      isLoading={loading}
                    >
                      Save Configuration
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

export interface Workspace {
  id: string;
  repoUrl: string;
  branch: string;
  path: string;
  lastAccessed: Date;
  metadata?: {
    isActive: boolean;
    commitHash?: string;
    size?: number;
    gitConfig?: {
      userEmail?: string;
      userName?: string;
      signingKey?: string;
    };
  };
}

export interface EnvironmentConfig {
  GITLAB_URL: string;
  GITLAB_TOKEN: string;
  CLAUDE_CODE_PATH: string;
  MAX_WORKSPACE_SIZE_MB: string;
  TEMP_DIR_PREFIX: string;
  LOG_LEVEL: string;
  ALLOWED_GITLAB_HOSTS: string;
  MAX_CONCURRENT_WORKSPACES: string;
}

export interface CloneForm {
  repoUrl: string;
  branch: string;
  depth: string;
  singleBranch: boolean;
  showCredentials: boolean;
  credentials: {
    username: string;
    password: string;
  };
}

export interface ClaudeForm {
  workspaceId: string;
  question: string;
  context: string;
  sourceBranch: string;
}

export interface GitConfigForm {
  workspaceId: string;
  userEmail: string;
  userName: string;
  signingKey: string;
} 
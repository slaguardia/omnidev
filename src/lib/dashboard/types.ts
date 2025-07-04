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
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

// Form types that match API parameter types
export interface AskForm {
  workspaceId: string;
  question: string;
  context: string;
  sourceBranch: string;
}

export interface EditForm extends AskForm {
  createMR: boolean;
  taskId: string;
  taskName: string;
  newBranchName: string;
}

// Union type for the form state
export type ClaudeForm = AskForm | EditForm;

export interface GitConfigForm {
  workspaceId: string;
  userEmail: string;
  userName: string;
  signingKey: string;
} 
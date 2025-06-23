// Environment configuration types
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

export const DEFAULT_CONFIG: EnvironmentConfig = {
  GITLAB_URL: 'https://gitlab.com',
  GITLAB_TOKEN: '',
  CLAUDE_CODE_PATH: '/usr/local/bin/claude-code',
  MAX_WORKSPACE_SIZE_MB: '1000',
  TEMP_DIR_PREFIX: 'gitlab-claude-',
  LOG_LEVEL: 'info',
  ALLOWED_GITLAB_HOSTS: 'gitlab.com,your-internal-gitlab.com',
  MAX_CONCURRENT_WORKSPACES: '5'
};

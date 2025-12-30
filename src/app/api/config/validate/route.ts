import { NextResponse } from 'next/server';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import {
  DEFAULT_CONFIG,
  isConfigurationComplete,
  validateConfig,
} from '@/lib/config/client-settings';
import type { AppConfig } from '@/lib/types/index';

function getConfigFilePath(): string {
  const workspaceDir = resolve(process.cwd(), 'workspaces');
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }
  return resolve(workspaceDir, 'app-config.json');
}

function loadConfigFromFile(): AppConfig {
  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const configData = readFileSync(configPath, 'utf-8');
    const savedConfig = JSON.parse(configData) as Partial<AppConfig>;
    return {
      gitlab: { ...DEFAULT_CONFIG.gitlab, ...savedConfig.gitlab },
      github: { ...DEFAULT_CONFIG.github, ...savedConfig.github },
      claude: { ...DEFAULT_CONFIG.claude, ...savedConfig.claude },
      workspace: { ...DEFAULT_CONFIG.workspace, ...savedConfig.workspace },
      security: { ...DEFAULT_CONFIG.security, ...savedConfig.security },
      logging: { ...DEFAULT_CONFIG.logging, ...savedConfig.logging },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function GET() {
  const config = loadConfigFromFile();

  const errors: string[] = [];
  errors.push(...validateConfig(config));

  // Completeness checks (what users actually care about)
  if (!config.gitlab.token) {
    errors.push('GitLab token is not set');
  }

  const usingCliAuth = config.claude.authMode === 'cli';
  const hasClaudeKey = Boolean(config.claude.apiKey || process.env.ANTHROPIC_API_KEY);
  if (!usingCliAuth && !hasClaudeKey) {
    errors.push('Claude API key is not set');
  }

  const isComplete = isConfigurationComplete(config);
  const valid = errors.length === 0 && isComplete;

  return NextResponse.json(
    {
      valid,
      errors,
      message: valid
        ? 'Configuration is valid'
        : isComplete
          ? 'Configuration has validation issues'
          : 'Configuration is incomplete',
    },
    // Always 200: this endpoint is used by the UI and should not take down the reverse proxy.
    { status: 200 }
  );
}

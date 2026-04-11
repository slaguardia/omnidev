/**
 * App configuration — file-backed (`data/app-config.json`) when DATABASE_URL is unset.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppConfig } from '@/lib/types/index';
import { decryptValue, encryptValue } from '@/lib/auth/crypto';
import { DEFAULT_CONFIG } from './client-settings';

export const APP_CONFIG_FILE = resolve(process.cwd(), 'data', 'app-config.json');

function ensureDataDir(): void {
  const dataDir = resolve(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

export function mergeAppConfigPartial(savedConfig: Partial<AppConfig>): AppConfig {
  return {
    gitlab: { ...DEFAULT_CONFIG.gitlab, ...savedConfig.gitlab },
    github: { ...DEFAULT_CONFIG.github, ...savedConfig.github },
    claude: { ...DEFAULT_CONFIG.claude, ...savedConfig.claude },
    workspace: { ...DEFAULT_CONFIG.workspace, ...savedConfig.workspace },
    security: { ...DEFAULT_CONFIG.security, ...savedConfig.security },
    logging: { ...DEFAULT_CONFIG.logging, ...savedConfig.logging },
  };
}

/**
 * Decrypt provider tokens after load (migration-safe for plaintext).
 */
export function finalizeAppConfigAfterLoad(config: AppConfig): AppConfig {
  const out: AppConfig = {
    ...config,
    gitlab: { ...config.gitlab },
    github: { ...config.github },
  };
  if (out.gitlab.token) out.gitlab.token = decryptValue(out.gitlab.token);
  if (out.github.token) out.github.token = decryptValue(out.github.token);
  return out;
}

/** Same encrypted-token representation as written to `app-config.json`. */
export function toPersistedAppConfig(config: AppConfig): AppConfig {
  const toSave: AppConfig = {
    ...config,
    gitlab: { ...config.gitlab },
    github: { ...config.github },
  };
  if (toSave.gitlab.token) toSave.gitlab.token = encryptValue(toSave.gitlab.token);
  if (toSave.github.token) toSave.github.token = encryptValue(toSave.github.token);
  return toSave;
}

export function loadConfig(): AppConfig {
  ensureDataDir();
  if (!existsSync(APP_CONFIG_FILE)) {
    return mergeAppConfigPartial({});
  }

  try {
    const savedConfig = JSON.parse(readFileSync(APP_CONFIG_FILE, 'utf-8')) as Partial<AppConfig>;
    const merged = mergeAppConfigPartial(savedConfig);
    return finalizeAppConfigAfterLoad(merged);
  } catch (error) {
    console.warn('Failed to load config file, using defaults:', error);
    return mergeAppConfigPartial({});
  }
}

export function saveConfig(config: AppConfig): void {
  ensureDataDir();
  const persisted = toPersistedAppConfig(config);
  writeFileSync(APP_CONFIG_FILE, JSON.stringify(persisted, null, 2), 'utf-8');
}

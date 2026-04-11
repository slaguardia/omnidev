/**
 * Map app config + repo URL to HTTPS git credentials (shared by worker and server git flows).
 */

import type { AppConfig } from '@/lib/types/index';
import { detectProviderFromUrl } from '@/lib/git/provider-detection';

export function getGitCredentialsFromConfig(
  config: AppConfig,
  repoUrl: string
): { username: string; password: string } | null {
  const provider = detectProviderFromUrl(repoUrl);

  if (provider === 'github') {
    if (config.github.token && config.github.username) {
      return { username: config.github.username, password: config.github.token };
    }
  } else if (provider === 'gitlab') {
    if (config.gitlab.token && config.gitlab.username) {
      return { username: config.gitlab.username, password: config.gitlab.token };
    }
  }

  return null;
}

/**
 * Build read-only repository context for chat using Git provider HTTP APIs (no git clone).
 */

import { Octokit } from '@octokit/rest';
import { detectProviderFromUrl } from '@/lib/git/provider-detection';
import { extractOwnerRepoFromUrl } from '@/lib/github/api';
import { getGitHubConfig } from '@/lib/github/config';
import { extractProjectIdFromUrl } from '@/lib/gitlab/api';
import { getGitLabConfig } from '@/lib/gitlab/config';
import type { GitUrl, Workspace } from '@/lib/types/index';

const MAX_TREE_LINES = 350;
const MAX_SNIPPET_FILES = 14;
const MAX_BYTES_PER_FILE = 6000;

const PRIORITY_NAMES = new Set([
  'readme.md',
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'CLAUDE.md',
  'claude.md',
]);

const TEXT_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.toml',
  '.css',
  '.html',
  '.svg',
  '.txt',
  '.env.example',
]);

function shouldSkipPath(p: string): boolean {
  const lower = p.toLowerCase();
  if (lower.includes('/node_modules/') || lower.startsWith('node_modules/')) return true;
  if (lower.includes('/.git/')) return true;
  if (lower.includes('/dist/') || lower.includes('/build/') || lower.includes('/.next/'))
    return true;
  return false;
}

function extOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i >= 0 ? path.slice(i).toLowerCase() : '';
}

function gitlabApiBaseFromRepoUrl(repoUrl: string, fallback: string): string {
  try {
    let https = repoUrl.trim();
    if (https.startsWith('git@')) {
      const m = https.match(/^git@([^:]+):(.+?)$/);
      if (m?.[1] && m?.[2]) {
        https = `https://${m[1]}/${m[2]}`;
      }
    }
    https = https.replace(/\.git$/, '');
    const u = new URL(https);
    return `${u.protocol}//${u.host}`;
  } catch {
    return fallback;
  }
}

async function fetchGitHubContext(repoUrl: string, branch: string): Promise<string> {
  const { token } = await getGitHubConfig();
  const ownerRepo = extractOwnerRepoFromUrl(repoUrl);
  if (!ownerRepo) {
    return '[Read-only repo context] Could not parse GitHub repository URL.';
  }
  const { owner, repo } = ownerRepo;
  const octokit = new Octokit({ auth: token ?? undefined });

  let commitSha: string;
  let resolvedBranch = branch;
  try {
    const br = await octokit.repos.getBranch({ owner, repo, branch });
    commitSha = br.data.commit.sha!;
  } catch {
    try {
      const r = await octokit.repos.get({ owner, repo });
      resolvedBranch = r.data.default_branch;
      const br = await octokit.repos.getBranch({ owner, repo, branch: resolvedBranch });
      commitSha = br.data.commit.sha!;
    } catch (e) {
      return `[Read-only repo context] GitHub: could not resolve branch or default (${e instanceof Error ? e.message : String(e)}).`;
    }
  }

  const treeResp = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: commitSha,
    recursive: '1',
  });

  const entries = treeResp.data.tree ?? [];
  const blobPaths = entries
    .filter((e) => e.type === 'blob' && e.path && !shouldSkipPath(e.path))
    .map((e) => e.path!)
    .sort();

  const truncatedTree = treeResp.data.truncated === true;
  const listed = blobPaths.slice(0, MAX_TREE_LINES);
  const treeBlock = [
    `Repository (read-only, GitHub ${owner}/${repo}, ref ${resolvedBranch}, commit ${commitSha.slice(0, 7)}).`,
    truncatedTree ? 'File tree was truncated by the API; listing is partial.' : '',
    'Tracked file paths (subset):',
    ...listed.map((p) => `- ${p}`),
  ]
    .filter(Boolean)
    .join('\n');

  const candidates: string[] = [];
  for (const name of PRIORITY_NAMES) {
    const found = blobPaths.find(
      (p) => p.toLowerCase().endsWith(`/${name}`) || p.toLowerCase() === name
    );
    if (found) candidates.push(found);
  }
  for (const p of blobPaths) {
    if (candidates.includes(p)) continue;
    const ext = extOf(p);
    if (TEXT_EXT.has(ext)) candidates.push(p);
  }

  const seen = new Set<string>();
  const unique = candidates.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  const snippets: string[] = [];
  for (const path of unique.slice(0, MAX_SNIPPET_FILES)) {
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: resolvedBranch,
      });
      if (Array.isArray(data) || data.type !== 'file') continue;
      if (data.encoding === 'base64' && typeof data.content === 'string') {
        const text = Buffer.from(data.content, 'base64').toString('utf8');
        const clipped =
          text.length > MAX_BYTES_PER_FILE
            ? text.slice(0, MAX_BYTES_PER_FILE) + '\n…(truncated)'
            : text;
        snippets.push(`--- ${path} ---\n${clipped}`);
      }
    } catch {
      // skip unreadable
    }
  }

  return [
    treeBlock,
    snippets.length ? '\nSelected file contents (read-only):\n\n' + snippets.join('\n\n') : '',
    '\nYou are in a read-only chat: do not assume a local clone; do not run git write operations.',
  ].join('\n');
}

async function fetchGitLabTree(
  projectId: string,
  baseUrl: string,
  token: string | null,
  ref: string
): Promise<{ path: string; type: string }[]> {
  const out: { path: string; type: string }[] = [];
  let page = 1;
  const perPage = 100;
  for (;;) {
    const url = new URL(
      `${baseUrl.replace(/\/$/, '')}/api/v4/projects/${encodeURIComponent(projectId)}/repository/tree`
    );
    url.searchParams.set('ref', ref);
    url.searchParams.set('recursive', 'true');
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['PRIVATE-TOKEN'] = token;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitLab tree HTTP ${res.status}`);
    }
    const chunk = (await res.json()) as { path?: string; type?: string }[];
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    for (const row of chunk) {
      if (row.path && row.type) out.push({ path: row.path, type: row.type });
    }
    if (chunk.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }
  return out;
}

async function fetchGitLabRaw(
  projectId: string,
  baseUrl: string,
  token: string | null,
  ref: string,
  filePath: string
): Promise<string | null> {
  const url = new URL(
    `${baseUrl.replace(/\/$/, '')}/api/v4/projects/${encodeURIComponent(projectId)}/repository/files/${encodeURIComponent(filePath)}/raw`
  );
  url.searchParams.set('ref', ref);
  const headers: Record<string, string> = {};
  if (token) headers['PRIVATE-TOKEN'] = token;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const text = await res.text();
  return text.length > MAX_BYTES_PER_FILE
    ? text.slice(0, MAX_BYTES_PER_FILE) + '\n…(truncated)'
    : text;
}

async function fetchGitLabContext(repoUrl: string, branch: string): Promise<string> {
  const { baseUrl: configBase, token } = await getGitLabConfig();
  const baseUrl = gitlabApiBaseFromRepoUrl(repoUrl, configBase);
  const projectId = extractProjectIdFromUrl(repoUrl as GitUrl);
  if (!projectId) {
    return '[Read-only repo context] Could not parse GitLab project path from URL.';
  }

  let ref = branch;
  let tree: { path: string; type: string }[];
  try {
    tree = await fetchGitLabTree(projectId, baseUrl, token, ref);
  } catch {
    try {
      const gl = await fetch(
        `${baseUrl.replace(/\/$/, '')}/api/v4/projects/${encodeURIComponent(projectId)}`,
        token ? { headers: { 'PRIVATE-TOKEN': token } } : {}
      );
      if (gl.ok) {
        const proj = (await gl.json()) as { default_branch?: string };
        if (proj.default_branch) ref = proj.default_branch;
      }
      tree = await fetchGitLabTree(projectId, baseUrl, token, ref);
    } catch (e) {
      return `[Read-only repo context] GitLab: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const blobPaths = tree
    .filter((e) => e.type === 'blob' && !shouldSkipPath(e.path))
    .map((e) => e.path)
    .sort();

  const listed = blobPaths.slice(0, MAX_TREE_LINES);
  const treeBlock = [
    `Repository (read-only, GitLab ${projectId}, ref ${ref}).`,
    'Tracked file paths (subset):',
    ...listed.map((p) => `- ${p}`),
  ].join('\n');

  const candidates: string[] = [];
  for (const name of PRIORITY_NAMES) {
    const found = blobPaths.find(
      (p) => p.toLowerCase().endsWith(`/${name}`) || p.toLowerCase() === name
    );
    if (found) candidates.push(found);
  }
  for (const p of blobPaths) {
    if (candidates.includes(p)) continue;
    if (TEXT_EXT.has(extOf(p))) candidates.push(p);
  }

  const seen = new Set<string>();
  const unique = candidates.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  const snippets: string[] = [];
  for (const path of unique.slice(0, MAX_SNIPPET_FILES)) {
    const raw = await fetchGitLabRaw(projectId, baseUrl, token, ref, path);
    if (raw) snippets.push(`--- ${path} ---\n${raw}`);
  }

  return [
    treeBlock,
    snippets.length ? '\nSelected file contents (read-only):\n\n' + snippets.join('\n\n') : '',
    '\nYou are in a read-only chat: do not assume a local clone; do not run git write operations.',
  ].join('\n');
}

/**
 * Returns markdown-style text for Claude context (no filesystem clone).
 */
export async function buildReadOnlyRepoContextForChat(workspace: Workspace): Promise<string> {
  const repoUrl = workspace.repoUrl?.trim();
  if (!repoUrl) {
    return '[Read-only repo context] No repository URL on this workspace.';
  }

  const branch = workspace.targetBranch?.trim() || 'main';

  try {
    const provider = detectProviderFromUrl(repoUrl);
    if (provider === 'github') {
      return await fetchGitHubContext(repoUrl, branch);
    }
    if (provider === 'gitlab') {
      return await fetchGitLabContext(repoUrl, branch);
    }
    return `[Read-only repo context] Provider "${provider}" is not supported for API-backed chat context yet. Configure a GitHub or GitLab repository URL.`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[read-only-repo-context]', msg);
    return `[Read-only repo context] Failed to load repository metadata: ${msg}`;
  }
}

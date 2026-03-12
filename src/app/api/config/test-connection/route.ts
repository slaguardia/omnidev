import { NextRequest, NextResponse } from 'next/server';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { withAuth } from '@/lib/auth/middleware';
import {
  parseJsonBody,
  badRequest,
  serverError,
  getErrorMessage,
} from '@/lib/api/response-helpers';
import { getConfig } from '@/lib/config/server-actions';
import { Octokit } from '@octokit/rest';
import { Gitlab } from '@gitbeaker/rest';

const LOG_PREFIX = 'TEST CONNECTION';

interface TestConnectionBody {
  provider: 'github' | 'gitlab';
  token?: string;
  gitlabUrl?: string;
}

interface SavedTestResult {
  username: string;
  testedAt: string;
}

interface SavedTestResults {
  github?: SavedTestResult;
  gitlab?: SavedTestResult;
}

function getResultsFilePath(): string {
  const dataDir = resolve(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return resolve(dataDir, 'connection-test-results.json');
}

function loadSavedResults(): SavedTestResults {
  const filePath = getResultsFilePath();
  if (!existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as SavedTestResults;
  } catch {
    return {};
  }
}

function saveResult(provider: 'github' | 'gitlab', username: string): void {
  const results = loadSavedResults();
  results[provider] = { username, testedAt: new Date().toISOString() };
  writeFileSync(getResultsFilePath(), JSON.stringify(results, null, 2), 'utf-8');
  console.log(`[${LOG_PREFIX}] Persisted ${provider} result for user: ${username}`);
}

function clearResult(provider: 'github' | 'gitlab'): void {
  const results = loadSavedResults();
  delete results[provider];
  writeFileSync(getResultsFilePath(), JSON.stringify(results, null, 2), 'utf-8');
}

/**
 * GET: Load persisted connection test results
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    const results = loadSavedResults();
    return NextResponse.json({ success: true, data: results }, { status: 200 });
  } catch (error) {
    console.error(`[${LOG_PREFIX}] Failed to load saved results:`, error);
    return serverError(error);
  }
}

/**
 * POST: Test a provider connection and persist the result
 */
export async function POST(request: NextRequest) {
  console.log(`[${LOG_PREFIX}] Request started at ${new Date().toISOString()}`);

  try {
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    const parsed = await parseJsonBody<TestConnectionBody>(request, LOG_PREFIX);
    if (!parsed.success) {
      return parsed.response;
    }

    const { provider, token: pendingToken, gitlabUrl } = parsed.data;

    if (provider !== 'github' && provider !== 'gitlab') {
      return badRequest('Invalid provider. Must be "github" or "gitlab".');
    }

    // Resolve the token: prefer pending (unsaved) token, fall back to saved config
    let token = pendingToken;
    let baseUrl = gitlabUrl;

    if (!token) {
      const config = await getConfig();
      if (provider === 'github') {
        token = config.github.token;
      } else {
        token = config.gitlab.token;
        if (!baseUrl) {
          baseUrl = config.gitlab.url;
        }
      }
    }

    if (!token) {
      clearResult(provider);
      return NextResponse.json(
        { success: false, error: `No ${provider} token configured or provided.` },
        { status: 200 }
      );
    }

    if (provider === 'github') {
      return await testGitHub(token);
    } else {
      return await testGitLab(token, baseUrl || 'https://gitlab.com');
    }
  } catch (error) {
    console.error(`[${LOG_PREFIX}] Unexpected error:`, error);
    return serverError(error);
  }
}

async function testGitHub(token: string): Promise<NextResponse> {
  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.users.getAuthenticated();
    console.log(`[${LOG_PREFIX}] GitHub connection successful for user: ${data.login}`);
    saveResult('github', data.login);
    return NextResponse.json({ success: true, data: { username: data.login } }, { status: 200 });
  } catch (error) {
    const message = getErrorMessage(error);
    console.log(`[${LOG_PREFIX}] GitHub connection failed: ${message}`);
    clearResult('github');
    return NextResponse.json(
      { success: false, error: `GitHub authentication failed: ${message}` },
      { status: 200 }
    );
  }
}

async function testGitLab(token: string, baseUrl: string): Promise<NextResponse> {
  try {
    const gitlab = new Gitlab({ host: baseUrl, token });
    const currentUser = await gitlab.Users.showCurrentUser();
    const username = (currentUser as { username: string }).username;
    console.log(`[${LOG_PREFIX}] GitLab connection successful for user: ${username}`);
    saveResult('gitlab', username);
    return NextResponse.json({ success: true, data: { username } }, { status: 200 });
  } catch (error) {
    const message = getErrorMessage(error);
    console.log(`[${LOG_PREFIX}] GitLab connection failed: ${message}`);
    clearResult('gitlab');
    return NextResponse.json(
      { success: false, error: `GitLab authentication failed: ${message}` },
      { status: 200 }
    );
  }
}

'use server';

/**
 * Read / write / delete the workspace's CLAUDE.md file.
 *
 * CLAUDE.md is the per-workspace agent context document — read by the agent
 * at run time, edited by users through the dashboard's Claude MD tab.
 * Despite the historical name, this file works with any AgentRunner: the
 * Cursor SDK respects per-workspace AGENT.md / CLAUDE.md conventions the
 * same way the deleted Claude Code CLI did.
 *
 * Lives in its own `lib/claudemd/` module (was previously co-located with
 * the deleted CLI integration under `lib/claudeCode/`).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

interface FetchClaudeMDContentResponse {
  content: string | null;
  fileExists: boolean;
}

interface SaveClaudeMDContent {
  content: string;
}

const CLAUDE_MD_PATH = path.join(process.cwd(), 'workspaces', 'CLAUDE.md');

export async function getClaudeMDContent(): Promise<FetchClaudeMDContentResponse> {
  try {
    const content = await fs.readFile(CLAUDE_MD_PATH, 'utf-8');
    return { content, fileExists: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      return { content: null, fileExists: false };
    }
    throw error;
  }
}

export async function saveClaudeMdContent(params: SaveClaudeMDContent) {
  try {
    await fs.mkdir(path.dirname(CLAUDE_MD_PATH), { recursive: true });
    await fs.writeFile(CLAUDE_MD_PATH, params.content, 'utf-8');
  } catch (error) {
    console.error('Error saving CLAUDE.md:', error);
    throw error;
  }
}

export async function deleteClaudeMdContent() {
  try {
    await fs.unlink(CLAUDE_MD_PATH);
  } catch (error) {
    console.error('Error deleting CLAUDE.md:', error);
    throw error;
  }
}

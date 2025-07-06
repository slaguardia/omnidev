'use server';

import { promises as fs } from 'fs';
import path from 'path';

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
      // File does not exist
      return { content: null, fileExists: false };
    }
    // Other errors
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

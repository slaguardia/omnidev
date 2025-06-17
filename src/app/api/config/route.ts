import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const CONFIG_DIR = join(process.cwd(), '.config');
const CONFIG_FILE = join(CONFIG_DIR, 'environment.json');

interface EnvironmentConfig {
  GITLAB_URL: string;
  GITLAB_TOKEN: string;
  CLAUDE_API_KEY: string;
  CLAUDE_CODE_PATH: string;
  MAX_WORKSPACE_SIZE_MB: string;
  CACHE_EXPIRY_DAYS: string;
  TEMP_DIR_PREFIX: string;
  LOG_LEVEL: string;
  ALLOWED_GITLAB_HOSTS: string;
  MAX_CONCURRENT_WORKSPACES: string;
}

const DEFAULT_CONFIG: EnvironmentConfig = {
  GITLAB_URL: 'https://gitlab.com',
  GITLAB_TOKEN: '',
  CLAUDE_API_KEY: '',
  CLAUDE_CODE_PATH: '/usr/local/bin/claude-code',
  MAX_WORKSPACE_SIZE_MB: '1000',
  CACHE_EXPIRY_DAYS: '7',
  TEMP_DIR_PREFIX: 'gitlab-claude-',
  LOG_LEVEL: 'info',
  ALLOWED_GITLAB_HOSTS: 'gitlab.com,your-internal-gitlab.com',
  MAX_CONCURRENT_WORKSPACES: '5'
};

export async function GET() {
  try {
    let config = DEFAULT_CONFIG;
    
    if (existsSync(CONFIG_FILE)) {
      const fileContent = await readFile(CONFIG_FILE, 'utf-8');
      const savedConfig = JSON.parse(fileContent);
      config = { ...DEFAULT_CONFIG, ...savedConfig };
    }
    
    return NextResponse.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Error loading config:', error);
    return NextResponse.json(
      { error: 'Failed to load configuration', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { config } = await request.json();
    
    if (!config) {
      return NextResponse.json(
        { error: 'Configuration data is required' },
        { status: 400 }
      );
    }
    
    // Ensure config directory exists
    if (!existsSync(CONFIG_DIR)) {
      await mkdir(CONFIG_DIR, { recursive: true });
    }
    
    // Save configuration to file
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    
    return NextResponse.json({
      success: true,
      message: 'Configuration saved successfully'
    });
  } catch (error) {
    console.error('Error saving config:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 
'use server';

import fs from 'fs/promises';
import path from 'path';
import { compare, hash } from 'bcryptjs';

/**
 * Get the path to the users.json file in the workspaces directory
 */
function getUsersFilePath(): string {
  const workspaceDir = path.resolve(process.cwd(), 'workspaces');
  return path.resolve(workspaceDir, 'users.json');
}

/**
 * Ensure the workspaces directory exists
 */
async function ensureWorkspaceDir(): Promise<void> {
  const workspaceDir = path.resolve(process.cwd(), 'workspaces');
  try {
    await fs.access(workspaceDir);
  } catch {
    await fs.mkdir(workspaceDir, { recursive: true });
  }
}

export async function getUser() {
  try {
    const file = getUsersFilePath();
    const content = await fs.readFile(file, 'utf-8');
    return JSON.parse(content); // { username, passwordHash }
  } catch {
    return null;
  }
}

export async function saveUser(username: string, password: string) {
  await ensureWorkspaceDir();
  const passwordHash = await hash(password, 10);
  const data = { username, passwordHash };
  const file = getUsersFilePath();
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  return data;
}

export async function verifyUser(username: string, password: string) {
  const user = await getUser();
  if (!user || user.username !== username) return false;
  return compare(password, user.passwordHash);
}

export async function hasUser(): Promise<boolean> {
  const user = await getUser();
  return user !== null;
}

'use server';

import fs from 'fs/promises';
import path from 'path';
import { compare, hash } from 'bcryptjs';

/**
 * Get the path to the users.json file in the data directory at the project root
 */
const dataDir = path.resolve(process.cwd(), 'data');

async function ensureDataDir() {
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

/**
 * Get the user from the users.json file
 */
export async function getUser() {
  try {
    await ensureDataDir();
    const file = getUsersFilePath();
    const content = await fs.readFile(file, 'utf-8');
    return JSON.parse(content); // { username, passwordHash }
  } catch {
    return null;
  }
}

/**
 * Save the user to the users.json file
 */
export async function saveUser(username: string, password: string) {
  const passwordHash = await hash(password, 10);
  const data = { username, passwordHash };
  await ensureDataDir();
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

/**
 * Get the path to the users.json file in the data directory at the project root
 */
function getUsersFilePath(): string {
  return path.resolve(dataDir, 'users.json');
}

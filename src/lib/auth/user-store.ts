'use server';

import fs from 'fs/promises';
import path from 'path';
import { compare, hash } from 'bcryptjs';

/**
 * Two-factor authentication data structure
 */
export interface TwoFactorData {
  enabled: boolean;
  secret: string | null; // Encrypted TOTP secret
  recoveryCodes: Array<{ hash: string; used: boolean }>;
}

/**
 * User data structure
 */
export interface UserData {
  username: string;
  passwordHash: string;
  twoFactor?: TwoFactorData;
}

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

export async function getUser(): Promise<UserData | null> {
  try {
    const file = getUsersFilePath();
    const content = await fs.readFile(file, 'utf-8');
    return JSON.parse(content);
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

export async function updatePassword(username: string, newPassword: string): Promise<boolean> {
  const user = await getUser();
  if (!user || user.username !== username) return false;

  const passwordHash = await hash(newPassword, 10);
  const data: UserData = {
    username,
    passwordHash,
    ...(user.twoFactor && { twoFactor: user.twoFactor }), // Preserve 2FA settings
  };
  const file = getUsersFilePath();
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  return true;
}

// ============================================
// Two-Factor Authentication Functions
// ============================================

/**
 * Check if 2FA is enabled for the user
 */
export async function getTwoFactorStatus(): Promise<{
  enabled: boolean;
  hasRecoveryCodes: boolean;
}> {
  const user = await getUser();
  if (!user || !user.twoFactor) {
    return { enabled: false, hasRecoveryCodes: false };
  }
  const unusedCodes = user.twoFactor.recoveryCodes.filter((c) => !c.used).length;
  return {
    enabled: user.twoFactor.enabled,
    hasRecoveryCodes: unusedCodes > 0,
  };
}

/**
 * Save the encrypted TOTP secret for a user (during setup, before enabling)
 */
export async function saveTwoFactorSecret(
  encryptedSecret: string,
  hashedRecoveryCodes: Array<{ hash: string; used: boolean }>
): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;

  const data: UserData = {
    ...user,
    twoFactor: {
      enabled: false, // Not enabled until verified
      secret: encryptedSecret,
      recoveryCodes: hashedRecoveryCodes,
    },
  };
  const file = getUsersFilePath();
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  return true;
}

/**
 * Enable 2FA after successful verification
 */
export async function enableTwoFactor(): Promise<boolean> {
  const user = await getUser();
  if (!user || !user.twoFactor?.secret) return false;

  const data: UserData = {
    ...user,
    twoFactor: {
      ...user.twoFactor,
      enabled: true,
    },
  };
  const file = getUsersFilePath();
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  return true;
}

/**
 * Disable 2FA for a user
 */
export async function disableTwoFactor(): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;

  const data: UserData = {
    ...user,
    twoFactor: {
      enabled: false,
      secret: null,
      recoveryCodes: [],
    },
  };
  const file = getUsersFilePath();
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  return true;
}

/**
 * Get the encrypted TOTP secret
 */
export async function getTwoFactorSecret(): Promise<string | null> {
  const user = await getUser();
  return user?.twoFactor?.secret || null;
}

/**
 * Get recovery codes (hashed)
 */
export async function getRecoveryCodes(): Promise<Array<{ hash: string; used: boolean }>> {
  const user = await getUser();
  return user?.twoFactor?.recoveryCodes || [];
}

/**
 * Mark a recovery code as used
 */
export async function markRecoveryCodeUsed(index: number): Promise<boolean> {
  const user = await getUser();
  const codeToMark = user?.twoFactor?.recoveryCodes[index];
  if (!user || !user.twoFactor || !codeToMark) return false;

  const updatedCodes = [...user.twoFactor.recoveryCodes];
  updatedCodes[index] = { hash: codeToMark.hash, used: true };

  const data: UserData = {
    ...user,
    twoFactor: {
      ...user.twoFactor,
      recoveryCodes: updatedCodes,
    },
  };
  const file = getUsersFilePath();
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  return true;
}

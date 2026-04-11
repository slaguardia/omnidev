'use server';

/**
 * PostgreSQL user store (Prisma `omnidev_users`). Used when DATABASE_URL is set.
 */

import { compare, hash } from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import type { TwoFactorData, UserData } from './user-store-file';

function rowToUserData(row: {
  username: string;
  passwordHash: string;
  twoFactor: string | null;
}): UserData {
  const out: UserData = {
    username: row.username,
    passwordHash: row.passwordHash,
  };
  if (row.twoFactor) {
    try {
      out.twoFactor = JSON.parse(row.twoFactor) as TwoFactorData;
    } catch {
      /* ignore */
    }
  }
  return out;
}

function twoFactorToColumn(tf: TwoFactorData | undefined): string | null {
  if (!tf) return null;
  return JSON.stringify(tf);
}

export async function getUser(): Promise<UserData | null> {
  const row = await prisma.omnidevUser.findFirst();
  return row ? rowToUserData(row) : null;
}

export async function saveUser(username: string, password: string): Promise<UserData> {
  const count = await prisma.omnidevUser.count();
  if (count > 0) {
    throw new Error('User account already exists — cannot overwrite');
  }
  const passwordHash = await hash(password, 10);
  await prisma.omnidevUser.create({
    data: { username, passwordHash, twoFactor: null },
  });
  return { username, passwordHash };
}

export async function verifyUser(username: string, password: string): Promise<boolean> {
  const user = await getUser();
  if (!user || user.username !== username) return false;
  return compare(password, user.passwordHash);
}

export async function hasUser(): Promise<boolean> {
  const user = await getUser();
  if (user === null) {
    console.log('[AUTH] No user account found — first-time setup required');
  }
  return user !== null;
}

export async function updatePassword(username: string, newPassword: string): Promise<boolean> {
  const user = await getUser();
  if (!user || user.username !== username) return false;

  const passwordHash = await hash(newPassword, 10);
  const data: UserData = {
    username,
    passwordHash,
    ...(user.twoFactor && { twoFactor: user.twoFactor }),
  };
  await prisma.omnidevUser.update({
    where: { username },
    data: {
      passwordHash: data.passwordHash,
      twoFactor: twoFactorToColumn(data.twoFactor),
    },
  });
  return true;
}

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

export async function saveTwoFactorSecret(
  encryptedSecret: string,
  hashedRecoveryCodes: Array<{ hash: string; used: boolean }>
): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;

  const data: UserData = {
    ...user,
    twoFactor: {
      enabled: false,
      secret: encryptedSecret,
      recoveryCodes: hashedRecoveryCodes,
    },
  };
  await prisma.omnidevUser.update({
    where: { username: user.username },
    data: { twoFactor: twoFactorToColumn(data.twoFactor) },
  });
  return true;
}

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
  await prisma.omnidevUser.update({
    where: { username: user.username },
    data: { twoFactor: twoFactorToColumn(data.twoFactor) },
  });
  return true;
}

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
  await prisma.omnidevUser.update({
    where: { username: user.username },
    data: { twoFactor: twoFactorToColumn(data.twoFactor) },
  });
  return true;
}

export async function getTwoFactorSecret(): Promise<string | null> {
  const user = await getUser();
  return user?.twoFactor?.secret || null;
}

export async function getRecoveryCodes(): Promise<Array<{ hash: string; used: boolean }>> {
  const user = await getUser();
  return user?.twoFactor?.recoveryCodes || [];
}

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
  await prisma.omnidevUser.update({
    where: { username: user.username },
    data: { twoFactor: twoFactorToColumn(data.twoFactor) },
  });
  return true;
}

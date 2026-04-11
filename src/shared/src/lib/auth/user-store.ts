'use server';

/**
 * User account storage — PostgreSQL (Prisma) when DATABASE_URL is set, else `data/users.json`.
 */

import { isPrismaConfigured } from '@/lib/db/prisma';
import * as file from './user-store-file';
import * as pg from './user-store-pg';

export type { UserData, TwoFactorData } from './user-store-file';

export async function getUser(): Promise<file.UserData | null> {
  return isPrismaConfigured() ? pg.getUser() : file.getUser();
}

export async function saveUser(username: string, password: string): Promise<file.UserData> {
  return isPrismaConfigured() ? pg.saveUser(username, password) : file.saveUser(username, password);
}

export async function verifyUser(username: string, password: string): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.verifyUser(username, password)
    : file.verifyUser(username, password);
}

export async function hasUser(): Promise<boolean> {
  return isPrismaConfigured() ? pg.hasUser() : file.hasUser();
}

export async function updatePassword(username: string, newPassword: string): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.updatePassword(username, newPassword)
    : file.updatePassword(username, newPassword);
}

export async function getTwoFactorStatus(): Promise<{
  enabled: boolean;
  hasRecoveryCodes: boolean;
}> {
  return isPrismaConfigured() ? pg.getTwoFactorStatus() : file.getTwoFactorStatus();
}

export async function saveTwoFactorSecret(
  encryptedSecret: string,
  hashedRecoveryCodes: Array<{ hash: string; used: boolean }>
): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.saveTwoFactorSecret(encryptedSecret, hashedRecoveryCodes)
    : file.saveTwoFactorSecret(encryptedSecret, hashedRecoveryCodes);
}

export async function enableTwoFactor(): Promise<boolean> {
  return isPrismaConfigured() ? pg.enableTwoFactor() : file.enableTwoFactor();
}

export async function disableTwoFactor(): Promise<boolean> {
  return isPrismaConfigured() ? pg.disableTwoFactor() : file.disableTwoFactor();
}

export async function getTwoFactorSecret(): Promise<string | null> {
  return isPrismaConfigured() ? pg.getTwoFactorSecret() : file.getTwoFactorSecret();
}

export async function getRecoveryCodes(): Promise<Array<{ hash: string; used: boolean }>> {
  return isPrismaConfigured() ? pg.getRecoveryCodes() : file.getRecoveryCodes();
}

export async function markRecoveryCodeUsed(index: number): Promise<boolean> {
  return isPrismaConfigured() ? pg.markRecoveryCodeUsed(index) : file.markRecoveryCodeUsed(index);
}

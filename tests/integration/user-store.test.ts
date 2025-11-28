import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getUser, saveUser, verifyUser, hasUser } from '@/lib/auth/user-store';
import fs from 'fs/promises';
import path from 'path';

describe('User Store', () => {
  const testWorkspaceDir = path.resolve(process.cwd(), 'workspaces');
  const testUserFilePath = path.resolve(testWorkspaceDir, 'users.json');
  let backupData: string | null = null;

  beforeEach(async () => {
    // Backup existing user data if it exists
    try {
      backupData = await fs.readFile(testUserFilePath, 'utf-8');
    } catch {
      backupData = null;
    }
  });

  afterEach(async () => {
    // Restore backup or clean up test data
    if (backupData !== null) {
      await fs.writeFile(testUserFilePath, backupData);
    } else {
      try {
        await fs.unlink(testUserFilePath);
      } catch {
        // File might not exist, that's ok
      }
    }
  });

  describe('saveUser', () => {
    it('should save a new user with hashed password', async () => {
      const username = 'testuser';
      const password = 'testpassword123';

      const user = await saveUser(username, password);

      expect(user.username).toBe(username);
      expect(user.passwordHash).toBeDefined();
      expect(user.passwordHash).not.toBe(password); // Should be hashed
      expect(user.passwordHash.length).toBeGreaterThan(20); // Bcrypt hashes are long
    });

    it('should create workspaces directory if it does not exist', async () => {
      const username = 'testuser2';
      const password = 'testpassword456';

      await saveUser(username, password);

      const dirExists = await fs
        .stat(testWorkspaceDir)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
    });
  });

  describe('getUser', () => {
    it('should return null when no user exists', async () => {
      // Clean up first
      try {
        await fs.unlink(testUserFilePath);
      } catch {
        // Ignore if file doesn't exist
      }

      const user = await getUser();

      expect(user).toBeNull();
    });

    it('should return saved user', async () => {
      const username = 'testuser3';
      const password = 'testpassword789';

      await saveUser(username, password);
      const user = await getUser();

      expect(user).not.toBeNull();
      expect(user?.username).toBe(username);
      expect(user?.passwordHash).toBeDefined();
    });
  });

  describe('verifyUser', () => {
    beforeEach(async () => {
      // Set up a test user
      await saveUser('verifytest', 'correctpassword');
    });

    it('should verify correct password', async () => {
      const result = await verifyUser('verifytest', 'correctpassword');

      expect(result).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const result = await verifyUser('verifytest', 'wrongpassword');

      expect(result).toBe(false);
    });

    it('should reject non-existent user', async () => {
      const result = await verifyUser('nonexistent', 'anypassword');

      expect(result).toBe(false);
    });

    it('should reject wrong username with correct password', async () => {
      const result = await verifyUser('wronguser', 'correctpassword');

      expect(result).toBe(false);
    });
  });

  describe('hasUser', () => {
    it('should return false when no user exists', async () => {
      // Clean up first
      try {
        await fs.unlink(testUserFilePath);
      } catch {
        // Ignore if file doesn't exist
      }

      const result = await hasUser();

      expect(result).toBe(false);
    });

    it('should return true when user exists', async () => {
      await saveUser('hasUserTest', 'password123');

      const result = await hasUser();

      expect(result).toBe(true);
    });
  });

  describe('Password Security', () => {
    it('should create different hashes for same password', async () => {
      const password = 'samepassword';

      const user1 = await saveUser('user1', password);

      // Clean up and save again
      try {
        await fs.unlink(testUserFilePath);
      } catch {
        // Ignore
      }

      const user2 = await saveUser('user2', password);

      // Bcrypt adds salt, so hashes should be different
      expect(user1.passwordHash).not.toBe(user2.passwordHash);
    });

    it('should verify password after multiple saves', async () => {
      const username = 'persisttest';
      const password = 'testpassword';

      await saveUser(username, password);

      // Verify can be done multiple times
      expect(await verifyUser(username, password)).toBe(true);
      expect(await verifyUser(username, password)).toBe(true);
      expect(await verifyUser(username, password)).toBe(true);
    });
  });
});

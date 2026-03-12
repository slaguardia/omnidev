import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:';

/**
 * Get encryption key derived from NEXTAUTH_SECRET (separate salt from TOTP)
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for token encryption');
  }
  return crypto.scryptSync(secret, 'token-encryption-salt', 32);
}

/**
 * Encrypt a plaintext value for storage.
 * Returns: "enc:iv_hex:authTag_hex:ciphertext_hex"
 */
export function encryptValue(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a value. If it starts with "enc:" it is decrypted;
 * otherwise it is returned as-is (migration-safe passthrough for legacy plaintext).
 */
export function decryptValue(value: string): string {
  if (!isEncrypted(value)) {
    return value;
  }

  const payload = value.slice(PREFIX.length);
  const [ivHex, authTagHex, encrypted] = payload.split(':');
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted token format');
  }
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Check if a value is encrypted (starts with "enc:" prefix)
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

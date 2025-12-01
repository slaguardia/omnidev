import crypto from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { hash, compare } from 'bcryptjs';

const ALGORITHM = 'aes-256-gcm';
const APP_NAME = 'GitLab Claude Manager';

/**
 * Get encryption key derived from NEXTAUTH_SECRET
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for 2FA encryption');
  }
  return crypto.scryptSync(secret, 'totp-encryption-salt', 32);
}

/**
 * Encrypt a TOTP secret for storage
 */
export function encryptSecret(plainSecret: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a stored TOTP secret
 */
export function decryptSecret(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted data format');
  }
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Generate a new TOTP secret and otpauth URL for a user
 */
export function generateSecret(username: string): { secret: string; otpAuthUrl: string } {
  const secret = authenticator.generateSecret();
  const otpAuthUrl = authenticator.keyuri(username, APP_NAME, secret);
  return { secret, otpAuthUrl };
}

/**
 * Generate a QR code as a base64 data URL
 */
export async function generateQRCode(otpAuthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpAuthUrl, {
    width: 256,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

/**
 * Verify a TOTP token against a secret
 */
export function verifyToken(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * Generate recovery codes (plain text for display, returns both plain and hashed)
 */
export async function generateRecoveryCodes(
  count: number = 10
): Promise<{ plain: string[]; hashed: Array<{ hash: string; used: boolean }> }> {
  const plain: string[] = [];
  const hashed: Array<{ hash: string; used: boolean }> = [];

  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric code in format XXXX-XXXX
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `${part1}-${part2}`;
    plain.push(code);
    const codeHash = await hash(code, 10);
    hashed.push({ hash: codeHash, used: false });
  }

  return { plain, hashed };
}

/**
 * Verify a recovery code against stored hashes
 */
export async function verifyRecoveryCode(
  code: string,
  storedCodes: Array<{ hash: string; used: boolean }>
): Promise<{ valid: boolean; index: number }> {
  // Normalize code (remove dashes and uppercase)
  const normalizedCode = code.replace(/-/g, '').toUpperCase();
  const formattedCode = `${normalizedCode.slice(0, 4)}-${normalizedCode.slice(4, 8)}`;

  for (let i = 0; i < storedCodes.length; i++) {
    const stored = storedCodes[i];
    if (!stored || stored.used) continue;

    const isMatch = await compare(formattedCode, stored.hash);
    if (isMatch) {
      return { valid: true, index: i };
    }
  }

  return { valid: false, index: -1 };
}

/**
 * Generate a pending auth token for 2FA verification
 * This token proves the user passed the first factor (password)
 */
export function generatePendingAuthToken(username: string): string {
  const payload = {
    username,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const data = JSON.stringify(payload);
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Verify and decode a pending auth token
 * Returns the username if valid and not expired (5 minute window)
 */
export function verifyPendingAuthToken(token: string): { valid: boolean; username?: string } {
  try {
    const [ivHex, authTagHex, encrypted] = token.split(':');
    if (!ivHex || !authTagHex || !encrypted) {
      return { valid: false };
    }

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    const payload = JSON.parse(decrypted);
    const age = Date.now() - payload.timestamp;

    // Token expires after 5 minutes
    if (age > 5 * 60 * 1000) {
      return { valid: false };
    }

    return { valid: true, username: payload.username };
  } catch {
    return { valid: false };
  }
}

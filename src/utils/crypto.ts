import crypto from 'crypto';

// AES-256-GCM encryption for sensitive fields (e.g. bank account numbers)
const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be set in .env (64 hex characters)');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString('base64')).join(':');
}

export function decrypt(payload: string): string {
  const [iv, tag, encrypted] = payload.split(':').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// "BH67BMAG00001299123456" -> "******************3456"
export function mask(value: string, visible = 4): string {
  if (value.length <= visible) return value;
  return '*'.repeat(value.length - visible) + value.slice(-visible);
}
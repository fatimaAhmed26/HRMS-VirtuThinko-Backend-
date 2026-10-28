import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const SALT_ROUNDS = 12;

// Password policy: 8+ chars, upper, lower, number
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

// Random temporary password that always satisfies the policy, e.g. "Vt-4kP9xQ2mL"
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const random = Array.from(crypto.randomBytes(8), (b) => chars[b % chars.length]).join('');
  return `Vt-${random}A1`;
}
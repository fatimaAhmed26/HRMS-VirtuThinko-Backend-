// Simple in-memory rate limiter (no extra package needed). Each key gets `max` requests per window.
// Used to slow down password guessing on login, token refresh and password change.
import { NextFunction, Request, Response } from 'express';

interface Options {
  windowMs: number;
  max: number;
  key: (req: Request) => string;
  message: string;
  failuresOnly?: boolean; // count only failed requests (401); a success clears the count
}

export function rateLimit({ windowMs, max, key, message, failuresOnly = false }: Options) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // forget old entries every minute so memory stays small
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, 60_000).unref();

  const add = (k: string, now: number) => {
    const entry = hits.get(k);
    if (!entry || entry.resetAt <= now) hits.set(k, { count: 1, resetAt: now + windowMs });
    else entry.count++;
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const k = key(req);
    if (failuresOnly) {
      res.on('finish', () => {
        if (res.statusCode === 401) add(k, Date.now());
        else if (res.statusCode < 400) hits.delete(k);
      });
    } else add(k, now);
    const entry = hits.get(k);
    if (entry && entry.resetAt > now && entry.count > (failuresOnly ? max - 1 : max)) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ message: `${message} Try again in ${Math.ceil(retryAfter / 60)} minute(s).` });
      return;
    }
    next();
  };
}

const ip = (req: Request) => req.ip ?? 'unknown';
const FIFTEEN_MIN = 15 * 60 * 1000;

// After 5 wrong passwords for an account (or 20 from one IP) sign-in is blocked for 15 minutes.
// Successful sign-ins are not counted, so normal use and the test scripts are never blocked.
export const loginLimiter = [
  rateLimit({ windowMs: FIFTEEN_MIN, max: 5, failuresOnly: true, message: 'Too many failed sign-in attempts for this account.',
    key: (req) => `login:${ip(req)}:${String(req.body?.identifier ?? '').trim().toLowerCase()}` }),
  rateLimit({ windowMs: FIFTEEN_MIN, max: 20, failuresOnly: true, message: 'Too many failed sign-in attempts.', key: (req) => `login-ip:${ip(req)}` }),
];
export const refreshLimiter = rateLimit({ windowMs: FIFTEEN_MIN, max: 120, message: 'Too many requests.', key: (req) => `refresh:${ip(req)}` });
export const passwordLimiter = rateLimit({ windowMs: FIFTEEN_MIN, max: 10, message: 'Too many password attempts.', key: (req) => `password:${req.user?.id ?? ip(req)}` });
// Each form import is a paid AI request: 40 per user per 15 minutes is plenty for HR work
export const scanLimiter = rateLimit({ windowMs: FIFTEEN_MIN, max: 40, message: 'Too many form imports.', key: (req) => `scan:${req.user?.id ?? ip(req)}` });

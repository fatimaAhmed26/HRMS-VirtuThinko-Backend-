import { CookieOptions, RequestHandler } from 'express';
import { z } from 'zod';
import * as authService from './auth.service';
import prisma from '../../config/prisma';

const loginSchema = z.object({
  identifier: z.string().trim().min(1), // username OR email
  password: z.string().min(1),
});

const REFRESH_COOKIE = 'refreshToken';
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Username/email and password are required' });
      return;
    }

    const { accessToken, refreshToken, user } = await authService.login(
      parsed.data.identifier,
      parsed.data.password
    );

    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
};

export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const { accessToken, refreshToken, user } = await authService.refresh(req.cookies?.[REFRESH_COOKIE]);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
};

export const logout: RequestHandler = (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({ message: 'Logged out' });
};

export const me: RequestHandler = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, username: true, email: true, employeeId: true, lastLoginAt: true },
    });
    res.json({ ...user, roles: req.user!.roles, permissions: req.user!.permissions });
  } catch (err) {
    next(err);
  }
};
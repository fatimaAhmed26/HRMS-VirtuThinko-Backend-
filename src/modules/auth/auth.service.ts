import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';

const accessInclude = {
  roles: {
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  },
} satisfies Prisma.UserInclude;

type UserWithAccess = Prisma.UserGetPayload<{ include: typeof accessInclude }>;

interface Access {
  roles: string[];
  permissions: string[];
}

function findUserWithAccess(where: Prisma.UserWhereInput) {
  return prisma.user.findFirst({ where, include: accessInclude });
}

function buildAccess(user: UserWithAccess): Access {
  const roles = user.roles.map((ur) => ur.role.name);
  const permissions = [
    ...new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.name))),
  ];
  return { roles, permissions };
}

const JWT_ALGORITHM = 'HS256' as const;

// Bcrypt hash of a random password, compared when the username does not exist,
// so a wrong username takes as long as a wrong password (no account guessing by timing)
const DUMMY_HASH = '$2b$12$xkVMRYASn3ONiQQnkFE1.eu4Kut1Pa9s4ffLI1TxEXtzhT74u5Z36';

function signTokens(user: UserWithAccess, access: Access) {
  const accessToken = jwt.sign(
    { sub: String(user.id), employeeId: user.employeeId, ...access },
    process.env.JWT_ACCESS_SECRET as string,
    { algorithm: JWT_ALGORITHM, expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as SignOptions['expiresIn'] }
  );
  const refreshToken = jwt.sign(
    { sub: String(user.id), ver: user.tokenVersion }, // must match the user's current tokenVersion to be accepted
    process.env.JWT_REFRESH_SECRET as string,
    { algorithm: JWT_ALGORITHM, expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as SignOptions['expiresIn'] }
  );
  return { accessToken, refreshToken };
}

function publicUser(user: UserWithAccess, access: Access) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    employeeId: user.employeeId,
    roles: access.roles,
    permissions: access.permissions,
  };
}

export async function login(identifier: string, password: string) {
  const user = await findUserWithAccess({
    OR: [{ email: identifier }, { username: identifier }],
  });

  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  // Same message for every failure, so attackers can't tell which part was wrong
  if (!user || !passwordOk || user.status !== 'active') {
    throw new HttpError(401, 'Invalid credentials or inactive account');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const access = buildAccess(user);
  return { ...signTokens(user, access), user: publicUser(user, access) };
}

export async function refresh(refreshToken: string | undefined) {
  if (!refreshToken) throw new HttpError(401, 'No refresh token');

  let userId: number;
  let version: number;
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string, { algorithms: [JWT_ALGORITHM] }) as jwt.JwtPayload;
    userId = Number(payload.sub);
    version = Number(payload.ver ?? -1);
  } catch {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }

  const user = await findUserWithAccess({ id: userId });
  if (!user || user.status !== 'active') throw new HttpError(401, 'Account inactive');
  if (version !== user.tokenVersion) throw new HttpError(401, 'Session ended - please sign in again');

  const access = buildAccess(user);
  return { ...signTokens(user, access), user: publicUser(user, access) };
}

// Ends every session of a user: their refresh tokens stop working (access tokens expire within 15 minutes)
export async function revokeSessions(userId: number, tx: Prisma.TransactionClient = prisma) {
  await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
}

// Logout: end the sessions of the user whose refresh cookie this is (if it is still valid)
export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string, { algorithms: [JWT_ALGORITHM] }) as jwt.JwtPayload;
    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) }, select: { id: true, tokenVersion: true } });
    if (user && Number(payload.ver) === user.tokenVersion) await revokeSessions(user.id);
  } catch {
    // an expired or invalid cookie needs no revoking
  }
}

// New tokens for a user who is already signed in (after changing their own password)
export async function sessionFor(userId: number) {
  const user = await findUserWithAccess({ id: userId });
  if (!user || user.status !== 'active') throw new HttpError(401, 'Account inactive');
  const access = buildAccess(user);
  return { ...signTokens(user, access), user: publicUser(user, access) };
}

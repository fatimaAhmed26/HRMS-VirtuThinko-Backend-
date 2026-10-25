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

function signTokens(user: UserWithAccess, access: Access) {
  const accessToken = jwt.sign(
    { sub: String(user.id), employeeId: user.employeeId, ...access },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as SignOptions['expiresIn'] }
  );
  const refreshToken = jwt.sign(
    { sub: String(user.id) },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as SignOptions['expiresIn'] }
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

  const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;

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
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string);
    userId = Number(payload.sub);
  } catch {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }

  const user = await findUserWithAccess({ id: userId });
  if (!user || user.status !== 'active') throw new HttpError(401, 'Account inactive');

  const access = buildAccess(user);
  return { ...signTokens(user, access), user: publicUser(user, access) };
}
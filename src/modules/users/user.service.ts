import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { diff, logAudit } from '../../utils/audit';
import { generateTempPassword, hashPassword, verifyPassword } from '../../utils/password';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './user.schema';

export interface Actor {
  userId: number;
  ip: string | null;
}

const SUPER_ADMIN = 'Super Admin';

// Never select passwordHash in anything we send back
const userSelect = {
  id: true,
  username: true,
  email: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, status: true } },
  roles: { select: { role: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function present(user: UserRow) {
  return { ...user, roles: user.roles.map((r) => r.role) };
}

async function findOrThrow(id: number) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw new HttpError(404, 'User not found');
  return user;
}

async function checkRoles(roleIds: number[]) {
  const unique = [...new Set(roleIds)];
  const found = await prisma.role.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  if (found.length !== unique.length) throw new HttpError(400, 'One or more roles do not exist');
  return found;
}

// An employee can only have one login, and must be active
async function checkEmployee(employeeId: number, exceptUserId?: number) {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, email: true, status: true, user: { select: { id: true } } },
  });
  if (!emp) throw new HttpError(400, 'Employee not found');
  if (emp.status !== 'active') throw new HttpError(400, 'Cannot link an account to an inactive employee');
  if (emp.user && emp.user.id !== exceptUserId) throw new HttpError(409, 'This employee already has a user account');
  return emp;
}

// Prevent locking everyone out: there must always be one active Super Admin
async function assertNotLastSuperAdmin(userId: number) {
  const isSuper = await prisma.userRole.findFirst({ where: { userId, role: { name: SUPER_ADMIN } } });
  if (!isSuper) return;
  const activeSupers = await prisma.user.count({
    where: { status: 'active', roles: { some: { role: { name: SUPER_ADMIN } } } },
  });
  if (activeSupers <= 1) throw new HttpError(400, 'Cannot remove or deactivate the last active Super Admin');
}

export async function list(q: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.roleId) where.roles = { some: { roleId: q.roleId } };
  if (q.search) {
    where.OR = [
      { username: { contains: q.search } },
      { email: { contains: q.search } },
      { employee: { firstName: { contains: q.search } } },
      { employee: { lastName: { contains: q.search } } },
      { employee: { employeeCode: { contains: q.search } } },
    ];
  }

  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { id: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  return { items: rows.map(present), page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
}

export async function getById(id: number) {
  return present(await findOrThrow(id));
}

export async function create(input: CreateUserInput, actor: Actor) {
  const roles = await checkRoles(input.roleIds);
  const employee = input.employeeId ? await checkEmployee(input.employeeId) : null;

  const email = input.email ?? employee?.email;
  if (!email) throw new HttpError(400, 'Email is required when no employee is linked');

  const tempPassword = input.password ? null : generateTempPassword();
  const passwordHash = await hashPassword(input.password ?? tempPassword!);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        username: input.username,
        email,
        passwordHash,
        employeeId: employee?.id ?? null,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      select: userSelect,
    });
    await logAudit(
      {
        actorUserId: actor.userId,
        action: 'user.create',
        entity: 'User',
        entityId: u.id,
        changes: { username: u.username, employeeId: u.employee?.id ?? null, roles: roles.map((r) => r.name) },
        ip: actor.ip,
      },
      tx
    );
    return u;
  });

  // The temporary password is returned ONCE so HR can give it to the employee
  return { user: present(user), temporaryPassword: tempPassword };
}

export async function update(id: number, input: UpdateUserInput, actor: Actor) {
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'User not found');
  if (input.employeeId) await checkEmployee(input.employeeId, id);

  const changes = diff(before, input);
  if (Object.keys(changes).length === 0) return getById(id);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: input, select: userSelect });
    await logAudit({ actorUserId: actor.userId, action: 'user.update', entity: 'User', entityId: id, changes, ip: actor.ip }, tx);
    return u;
  });
  return present(user);
}

export async function setRoles(id: number, roleIds: number[], actor: Actor) {
  if (id === actor.userId) throw new HttpError(400, 'You cannot change your own roles');
  const before = await findOrThrow(id);
  const roles = await checkRoles(roleIds);

  const removingSuper = before.roles.some((r) => r.role.name === SUPER_ADMIN) && !roles.some((r) => r.name === SUPER_ADMIN);
  if (removingSuper) await assertNotLastSuperAdmin(id);

  const user = await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: id } });
    await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) });
    await logAudit(
      {
        actorUserId: actor.userId,
        action: 'user.roles',
        entity: 'User',
        entityId: id,
        changes: { from: before.roles.map((r) => r.role.name), to: roles.map((r) => r.name) },
        ip: actor.ip,
      },
      tx
    );
    return tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
  });
  return present(user);
}

export async function setStatus(id: number, status: 'active' | 'inactive', actor: Actor) {
  if (id === actor.userId) throw new HttpError(400, 'You cannot change your own account status');
  const before = await findOrThrow(id);
  if (before.status === status) throw new HttpError(400, `User is already ${status}`);
  if (status === 'inactive') await assertNotLastSuperAdmin(id);
  if (status === 'active' && before.employee && before.employee.status !== 'active') {
    throw new HttpError(400, 'Cannot activate an account linked to an inactive employee');
  }

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: { status }, select: userSelect });
    await logAudit(
      {
        actorUserId: actor.userId,
        action: status === 'inactive' ? 'user.deactivate' : 'user.activate',
        entity: 'User',
        entityId: id,
        changes: { status: { from: before.status, to: status } },
        ip: actor.ip,
      },
      tx
    );
    return u;
  });
  return present(user);
}

export async function resetPassword(id: number, password: string | undefined, actor: Actor) {
  await findOrThrow(id);
  const tempPassword = password ? null : generateTempPassword();
  const passwordHash = await hashPassword(password ?? tempPassword!);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash } });
    // the password itself is never written to the audit log
    await logAudit({ actorUserId: actor.userId, action: 'user.password_reset', entity: 'User', entityId: id, ip: actor.ip }, tx);
  });

  return { message: 'Password reset', temporaryPassword: tempPassword };
}

// Logged-in user changes their own password
export async function changeOwnPassword(userId: number, currentPassword: string, newPassword: string, ip: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  if (currentPassword === newPassword) throw new HttpError(400, 'New password must be different');

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
    await logAudit({ actorUserId: userId, action: 'user.password_change', entity: 'User', entityId: userId, ip }, tx);
  });
  return { message: 'Password changed' };
}
import prisma from '../config/prisma';

export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string; // e.g. "expiry:document:12:user:3" - the same key is only ever sent once
}

export async function notifyUsers(userIds: number[], n: NotificationInput) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: unique.map((userId) => ({
        userId, type: n.type, title: n.title.slice(0, 150), body: n.body?.slice(0, 500), link: n.link,
        dedupeKey: n.dedupeKey ? `${n.dedupeKey}:u${userId}`.slice(0, 120) : null,
      })),
      skipDuplicates: true,
    });
  } catch (err) {
    console.error('notify failed', err);
  }
}

export async function userIdsForEmployees(employeeIds: number[]) {
  if (employeeIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { employeeId: { in: employeeIds }, status: 'active' },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function notifyEmployee(employeeId: number, n: NotificationInput) {
  await notifyUsers(await userIdsForEmployees([employeeId]), n);
}

export async function userIdsWithPermission(permission: string, country?: string) {
  const users = await prisma.user.findMany({
    where: {
      status: 'active',
      ...(country ? { entityScope: { in: ['ALL', country] } } : {}),
      roles: { some: { role: { permissions: { some: { permission: { name: permission } } } } } },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function notifyPermission(permission: string, n: NotificationInput, country?: string) {
  await notifyUsers(await userIdsWithPermission(permission, country), n);
}
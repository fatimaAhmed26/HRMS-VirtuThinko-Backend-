import prisma from '../config/prisma';

export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string; // e.g. "expiry:document:12:user:3" - the same key is only ever sent once
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

import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { cleanFileName, detectFileType, saveFile } from '../../utils/fileStorage';
import { notifyUsers } from '../../utils/notify';
import type { AuthUser } from '../../types/express';
import type { AnnouncementInput, UpdateAnnouncementInput } from './announcement.schema';

type Ip = string | null;
type Row = Prisma.AnnouncementGetPayload<object>;

const ids = (v: Prisma.JsonValue | null) => (Array.isArray(v) ? (v as number[]) : []);

// Never expose the stored file name
function present(a: Row) {
  const { attachmentStoredName, ...rest } = a;
  return { ...rest, departmentIds: ids(a.departmentIds), employeeIds: ids(a.employeeIds), hasAttachment: Boolean(attachmentStoredName) };
}

function isLive(a: Row, now = new Date()) {
  return a.publishAt <= now && (!a.expiresAt || a.expiresAt > now);
}

// Is this announcement meant for this employee?
function targets(a: Row, emp: { id: number; departmentId: number | null } | null) {
  if (a.audience === 'all') return true;
  if (!emp) return false;
  if (a.audience === 'departments') return emp.departmentId !== null && ids(a.departmentIds).includes(emp.departmentId);
  return ids(a.employeeIds).includes(emp.id);
}

async function employeeOf(user: AuthUser) {
  return user.employeeId ? prisma.employee.findUnique({ where: { id: user.employeeId }, select: { id: true, departmentId: true } }) : null;
}

// Users who should get the in app notification
async function recipientUserIds(a: Row) {
  const where: Prisma.UserWhereInput = { status: 'active' };
  if (a.audience === 'departments') where.employee = { departmentId: { in: ids(a.departmentIds) } };
  if (a.audience === 'employees') where.employeeId = { in: ids(a.employeeIds) };
  return (await prisma.user.findMany({ where, select: { id: true } })).map((u) => u.id);
}

// Sends notifications once an announcement is live (called on create and by the scheduled job)
export async function notifyIfLive(a: Row) {
  if (a.notified || !isLive(a)) return;
  await notifyUsers(await recipientUserIds(a), {
    type: 'announcement', title: a.priority === 'normal' ? a.title : `[${a.priority.toUpperCase()}] ${a.title}`,
    body: a.body.slice(0, 200), link: `/announcements/${a.id}`, dedupeKey: `announcement:${a.id}`,
  });
  await prisma.announcement.update({ where: { id: a.id }, data: { notified: true } });
}

function validateTargets(input: { audience?: string; departmentIds?: number[]; employeeIds?: number[] }) {
  if (input.audience === 'departments' && !input.departmentIds?.length) throw new HttpError(400, 'Choose at least one department');
  if (input.audience === 'employees' && !input.employeeIds?.length) throw new HttpError(400, 'Choose at least one employee');
}

export async function create(input: AnnouncementInput, user: AuthUser, ip: Ip) {
  validateTargets(input);
  const a = await prisma.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: {
        title: input.title, body: input.body, priority: input.priority, pinned: input.pinned, audience: input.audience,
        departmentIds: input.audience === 'departments' ? input.departmentIds : Prisma.DbNull,
        employeeIds: input.audience === 'employees' ? input.employeeIds : Prisma.DbNull,
        publishAt: input.publishAt ?? new Date(), expiresAt: input.expiresAt ?? null, createdByUserId: user.id,
      },
    });
    await logAudit({ actorUserId: user.id, action: 'announcement.create', entity: 'Announcement', entityId: created.id,
      changes: { title: input.title, audience: input.audience }, ip }, tx);
    return created;
  });
  await notifyIfLive(a);
  return present(a);
}

export async function update(id: number, input: UpdateAnnouncementInput, user: AuthUser, ip: Ip) {
  const before = await prisma.announcement.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'Announcement not found');
  validateTargets({
    audience: input.audience ?? before.audience,
    departmentIds: input.departmentIds ?? ids(before.departmentIds),
    employeeIds: input.employeeIds ?? ids(before.employeeIds),
  });
  const data: Prisma.AnnouncementUpdateInput = {
    title: input.title, body: input.body, priority: input.priority, pinned: input.pinned, audience: input.audience,
    publishAt: input.publishAt, expiresAt: input.expiresAt,
  };
  if (input.departmentIds) data.departmentIds = input.departmentIds;
  if (input.employeeIds) data.employeeIds = input.employeeIds;
  const a = await prisma.$transaction(async (tx) => {
    const u = await tx.announcement.update({ where: { id }, data });
    await logAudit({ actorUserId: user.id, action: 'announcement.update', entity: 'Announcement', entityId: id, changes: { fields: Object.keys(input) }, ip }, tx);
    return u;
  });
  await notifyIfLive(a);
  return present(a);
}

export async function remove(id: number, user: AuthUser, ip: Ip) {
  if (!(await prisma.announcement.findUnique({ where: { id } }))) throw new HttpError(404, 'Announcement not found');
  await prisma.$transaction(async (tx) => {
    await tx.announcement.delete({ where: { id } });
    await logAudit({ actorUserId: user.id, action: 'announcement.delete', entity: 'Announcement', entityId: id, ip }, tx);
  });
}

export async function attach(id: number, file: Express.Multer.File, user: AuthUser, ip: Ip) {
  if (!(await prisma.announcement.findUnique({ where: { id } }))) throw new HttpError(404, 'Announcement not found');
  const type = detectFileType(file.buffer);
  const storedName = await saveFile(file.buffer, type.ext);
  const a = await prisma.announcement.update({
    where: { id }, data: { attachmentName: cleanFileName(file.originalname), attachmentStoredName: storedName, attachmentMime: type.mime },
  });
  await logAudit({ actorUserId: user.id, action: 'announcement.attach', entity: 'Announcement', entityId: id, ip });
  return present(a);
}

// HR list everything including scheduled and expired
export async function listAll() {
  const rows = await prisma.announcement.findMany({ orderBy: [{ pinned: 'desc' }, { publishAt: 'desc' }] });
  const now = new Date();
  return rows.map((a) => ({ ...present(a), state: a.publishAt > now ? 'scheduled' : isLive(a, now) ? 'live' : 'expired' }));
}

// Employee home page: live announcements meant for me pinned first
export async function forMe(user: AuthUser, limit?: number) {
  const now = new Date();
  const emp = await employeeOf(user);
  const rows = await prisma.announcement.findMany({
    where: { publishAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: [{ pinned: 'desc' }, { publishAt: 'desc' }],
  });
  const mine = rows.filter((a) => targets(a, emp)).map(present);
  return limit ? mine.slice(0, limit) : mine;
}

// One announcement + permission check returns the raw row for attachment download
export async function getForUser(id: number, user: AuthUser) {
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, 'Announcement not found');
  const manager = user.permissions.includes('announcement:manage');
  if (!manager && (!isLive(a) || !targets(a, await employeeOf(user)))) throw new HttpError(404, 'Announcement not found');
  return a;
}

export const presentOne = present;
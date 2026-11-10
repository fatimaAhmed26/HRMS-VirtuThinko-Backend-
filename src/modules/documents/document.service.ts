import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { cleanFileName, detectFileType, saveFile } from '../../utils/fileStorage';
import type { AuthUser } from '../../types/express';
import { SELF_CATEGORIES, type ListDocumentsQuery, type UploadInput } from './document.schema';

// HR-level access to everyone's documents
const isHr = (u: AuthUser) => u.permissions.includes('document:view');

// Never expose storedName (the file's location on disk)
const documentSelect = {
  id: true,
  employeeId: true,
  category: true,
  title: true,
  originalName: true,
  mimeType: true,
  size: true,
  expiryDate: true,
  remindDaysBefore: true,
  visibleToEmployee: true,
  notes: true,
  uploadedByUserId: true,
  createdAt: true,
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
} satisfies Prisma.DocumentSelect;

export async function upload(file: Express.Multer.File, input: UploadInput, user: AuthUser, ip: string | null) {
  const employeeId = input.employeeId ?? user.employeeId;
  if (!employeeId) throw new HttpError(400, 'employeeId is required (your account is not linked to an employee)');

  const forSelf = employeeId === user.employeeId;
  if (!isHr(user)) {
    if (!forSelf) throw new HttpError(403, 'You can only upload your own documents');
    if (!SELF_CATEGORIES.includes(input.category)) throw new HttpError(403, `Only HR can upload "${input.category}" documents`);
    if (input.visibleToEmployee === false) throw new HttpError(400, 'Your own uploads are always visible to you');
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const type = detectFileType(file.buffer); // checks the real content, not the extension
  const storedName = await saveFile(file.buffer, type.ext);
  const originalName = cleanFileName(file.originalname);

  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        employeeId,
        category: input.category,
        title: input.title ?? originalName,
        originalName,
        storedName,
        mimeType: type.mime,
        size: file.size,
        expiryDate: input.expiryDate ?? null,
        remindDaysBefore: input.expiryDate ? input.remindDaysBefore ?? null : null,
        notes: input.notes ?? null,
        visibleToEmployee: input.visibleToEmployee ?? true,
        uploadedByUserId: user.id,
      },
      select: documentSelect,
    });
    await logAudit(
      { actorUserId: user.id, action: 'document.upload', entity: 'Document', entityId: doc.id,
        changes: { employeeId, category: doc.category, file: originalName, size: file.size }, ip },
      tx
    );
    return doc;
  });
}

export async function myDocuments(user: AuthUser) {
  if (!user.employeeId) throw new HttpError(400, 'Your account is not linked to an employee record');
  return prisma.document.findMany({
    where: { employeeId: user.employeeId, deletedAt: null, OR: [{ visibleToEmployee: true }, { uploadedByUserId: user.id }] },
    select: documentSelect,
    orderBy: { createdAt: 'desc' },
  });
}

export async function list(q: ListDocumentsQuery, scope: Prisma.EmployeeWhereInput = {}) {
  const where: Prisma.DocumentWhereInput = { deletedAt: null, employee: scope };
  if (q.employeeId) where.employeeId = q.employeeId;
  if (q.category) where.category = q.category;
  if (q.expiringWithinDays !== undefined) {
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + q.expiringWithinDays);
    where.expiryDate = { lte: until };
  }

  const [total, items] = await prisma.$transaction([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where, select: documentSelect,
      orderBy: q.expiringWithinDays !== undefined ? { expiryDate: 'asc' } : { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize, take: q.pageSize,
    }),
  ]);
  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
}

// Who may open a document: HR, the employee (if visible or uploaded by them),
// or their direct manager for leave attachments (to review a sick note before approving)
async function assertCanAccess(doc: { employeeId: number; category: string; visibleToEmployee: boolean; uploadedByUserId: number }, user: AuthUser) {
  if (isHr(user)) return;
  if (doc.employeeId === user.employeeId && (doc.visibleToEmployee || doc.uploadedByUserId === user.id)) return;
  if (doc.category === 'leave_attachment' && user.employeeId && user.permissions.includes('leave:approve')) {
    const emp = await prisma.employee.findUnique({ where: { id: doc.employeeId }, select: { managerId: true } });
    if (emp?.managerId === user.employeeId) return;
  }
  throw new HttpError(403, 'You do not have access to this document');
}

async function findActive(id: number) {
  const doc = await prisma.document.findFirst({ where: { id, deletedAt: null } });
  if (!doc) throw new HttpError(404, 'Document not found');
  return doc;
}

export async function getById(id: number, user: AuthUser) {
  const doc = await findActive(id);
  await assertCanAccess(doc, user);
  return prisma.document.findUniqueOrThrow({ where: { id }, select: documentSelect });
}

// Returns what the controller needs to stream the file; every download is logged
export async function prepareDownload(id: number, user: AuthUser, ip: string | null) {
  const doc = await findActive(id);
  await assertCanAccess(doc, user);
  await logAudit({ actorUserId: user.id, action: 'document.download', entity: 'Document', entityId: id, ip });
  return { storedName: doc.storedName, originalName: doc.originalName, mimeType: doc.mimeType };
}

// Soft delete: hidden everywhere, file kept on disk for the retention period
export async function remove(id: number, user: AuthUser, ip: string | null) {
  const doc = await findActive(id);
  const inUse = await prisma.leaveRequest.count({
    where: { attachmentId: id, status: { in: ['pending_manager', 'pending_hr', 'approved'] } },
  });
  if (inUse > 0) throw new HttpError(400, 'This document is attached to an active leave request');

  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit(
      { actorUserId: user.id, action: 'document.delete', entity: 'Document', entityId: id,
        changes: { employeeId: doc.employeeId, file: doc.originalName }, ip },
      tx
    );
  });
}
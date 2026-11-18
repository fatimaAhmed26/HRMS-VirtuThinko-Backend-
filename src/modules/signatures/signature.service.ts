import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { assertEmployee } from '../../utils/scope';
import { detectFileType, saveFile } from '../../utils/fileStorage';
import type { AuthUser } from '../../types/express';
import type { SignInput } from './signature.schema';

// The JSON body limit is 100 kB, so a signature image above this size can't arrive anyway
const MAX_SIGNATURE_BYTES = 64 * 1024;

const listSelect = {
  id: true, employeeId: true, kind: true, title: true, status: true, token: true,
  createdAt: true, expiresAt: true, signedAt: true, signerName: true,
} as const;

export async function list(employeeId: number, user: AuthUser) {
  await assertEmployee(user, employeeId);
  const rows = await prisma.signatureRequest.findMany({
    where: { employeeId }, select: listSelect, orderBy: { createdAt: 'desc' },
  });
  // the link only matters while the request is still waiting for a signature
  return rows.map((r) => ({ ...r, token: r.status === 'sent' ? r.token : null }));
}

export async function cancel(id: number, user: AuthUser, ip: string | null) {
  const current = await prisma.signatureRequest.findUnique({ where: { id }, select: { employeeId: true, status: true } });
  if (!current) throw new HttpError(404, 'Signature request not found');
  await assertEmployee(user, current.employeeId);
  if (current.status !== 'sent') throw new HttpError(400, 'Only requests still waiting for a signature can be cancelled');

  return prisma.$transaction(async (tx) => {
    const result = await tx.signatureRequest.updateMany({ where: { id, status: 'sent' }, data: { status: 'cancelled' } });
    if (result.count === 0) throw new HttpError(409, 'This request was just signed or cancelled');
    await logAudit({ actorUserId: user.id, action: 'signature.cancel', entity: 'Employee', entityId: current.employeeId, changes: { request: id }, ip }, tx);
    return { ...(await tx.signatureRequest.findUniqueOrThrow({ where: { id }, select: listSelect })), token: null };
  });
}

// ───── public: the employee opens the link, no sign-in ─────

async function findByToken(token: string) {
  const row = await prisma.signatureRequest.findUnique({
    where: { token },
    select: {
      id: true, employeeId: true, kind: true, title: true, status: true, expiresAt: true, signedAt: true,
      documentStoredName: true, documentName: true,
      employee: { select: { firstName: true, lastName: true } },
    },
  });
  if (!row) throw new HttpError(404, 'This link is not valid');
  return row;
}

const isExpired = (row: { status: string; expiresAt: Date }) => row.status === 'sent' && row.expiresAt.getTime() < Date.now();

export async function publicInfo(token: string) {
  const row = await findByToken(token);
  return {
    title: row.title,
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
    status: isExpired(row) ? 'expired' : row.status,
    expiresAt: row.expiresAt,
    signedAt: row.signedAt,
  };
}

export async function publicDocument(token: string) {
  const row = await findByToken(token);
  if (row.status === 'cancelled') throw new HttpError(400, 'HR cancelled this request');
  if (isExpired(row)) throw new HttpError(400, 'This link has expired. Ask HR for a new one.');
  return { storedName: row.documentStoredName, name: row.documentName };
}

export async function publicSign(token: string, input: SignInput, ip: string | null) {
  const row = await findByToken(token);
  if (row.status !== 'sent') {
    throw new HttpError(400, row.status === 'signed' ? 'This document is already signed' : 'This document can no longer be signed');
  }
  if (isExpired(row)) throw new HttpError(400, 'This link has expired. Ask HR for a new one.');

  const image = Buffer.from(input.signatureImage.split(',')[1], 'base64');
  if (image.length > MAX_SIGNATURE_BYTES) throw new HttpError(400, 'The signature image is too large');
  if (detectFileType(image).mime !== 'image/png') throw new HttpError(400, 'The signature must be a PNG image');
  const signatureStoredName = await saveFile(image, '.png');
  const signedAt = new Date();

  await prisma.$transaction(async (tx) => {
    // the status check in the WHERE clause stops two submissions from both succeeding
    const result = await tx.signatureRequest.updateMany({
      where: { id: row.id, status: 'sent' },
      data: { status: 'signed', signedAt, signerName: input.signerName, signerIp: ip, signatureStoredName },
    });
    if (result.count === 0) throw new HttpError(409, 'This document is already signed');

    await logAudit({
      actorUserId: null, action: 'signature.sign', entity: 'Employee', entityId: row.employeeId,
      changes: { request: row.id, kind: row.kind, signer: input.signerName }, ip,
    }, tx);
  });
  return { ok: true, signedAt };
}

import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { cleanFileName, detectFileType, filePath, saveFile } from '../../utils/fileStorage';
import type { AuthUser } from '../../types/express';

const EXPIRY_MS = 14 * 86_400_000;
const MAX_ANSWERS_BYTES = 200 * 1024;

// Entity, salary, department, manager, work email and the HR block are filled in by HR, so a link never stores them
const HR_ONLY_KEYS = [
  'team', 'clientCompanyId', 'employedBy', 'clientSite', 'poNumber', 'deploymentStart', 'deploymentEnd', 'clientSupervisor',
  'departmentId', 'managerId', 'email',
  'bankName', 'bankBranch', 'bankAccountHolder', 'bankAccountNumber', 'monthlySalary',
  'verifiedAt', 'hrRemarks',
];

// Checklist keys the employee may upload (the same keys as CHECKLIST in the web app)
export const FILE_KEYS = [
  'passport', 'nationalId', 'permit', 'photo', 'education', 'professional', 'experience', 'police', 'iban', 'dependants', 'cv',
] as const;
export type FileKey = (typeof FILE_KEYS)[number];

interface StoredFile { storedName: string; name: string }

const listSelect = { id: true, status: true, token: true, createdAt: true, expiresAt: true, submittedAt: true } as const;

// "expired" is derived: the stored status stays "sent" until HR cancels or the employee submits
function summary(row: { id: number; status: string; token: string; createdAt: Date; expiresAt: Date; submittedAt: Date | null }) {
  const expired = row.status === 'sent' && row.expiresAt.getTime() < Date.now();
  return {
    id: row.id,
    status: expired ? 'expired' : row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    submittedAt: row.submittedAt,
    // the link is only shown to HR while it can still be used
    token: row.status === 'sent' && !expired ? row.token : null,
  };
}

export async function create(user: AuthUser, ip: string | null) {
  const row = await prisma.onboardingLink.create({
    data: {
      token: crypto.randomBytes(32).toString('hex'),
      createdByUserId: user.id,
      expiresAt: new Date(Date.now() + EXPIRY_MS),
    },
    select: listSelect,
  });
  await logAudit({ actorUserId: user.id, action: 'onboarding.link', entity: 'OnboardingLink', entityId: row.id, ip });
  return summary(row);
}

export async function list() {
  const rows = await prisma.onboardingLink.findMany({ select: listSelect, orderBy: { createdAt: 'desc' }, take: 200 });
  return rows.map(summary);
}

// The answers HR opens in Add employee; files are listed here and downloaded one by one
export async function details(id: number) {
  const row = await prisma.onboardingLink.findUnique({
    where: { id },
    select: { ...listSelect, answers: true, files: true },
  });
  if (!row) throw new HttpError(404, 'Form not found');
  const files = (row.files ?? {}) as unknown as Record<string, StoredFile>;
  return {
    ...summary(row),
    answers: row.answers ?? null,
    files: Object.entries(files).map(([key, f]) => ({ key, name: f.name })),
  };
}

export async function cancel(id: number, user: AuthUser, ip: string | null) {
  const result = await prisma.onboardingLink.updateMany({ where: { id, status: 'sent' }, data: { status: 'cancelled' } });
  if (result.count === 0) throw new HttpError(400, 'Only forms still waiting for the employee can be cancelled');
  await logAudit({ actorUserId: user.id, action: 'onboarding.cancel', entity: 'OnboardingLink', entityId: id, ip });
  return { ok: true };
}

export async function fileFor(id: number, key: string) {
  const row = await prisma.onboardingLink.findUnique({ where: { id }, select: { files: true } });
  const stored = (row?.files as unknown as Record<string, StoredFile> | null | undefined)?.[key];
  if (!stored) throw new HttpError(404, 'File not found');
  return { path: filePath(stored.storedName), name: stored.name };
}

// ───── public: the employee opens the link, no sign-in ─────

async function findByToken(token: string) {
  const row = await prisma.onboardingLink.findUnique({
    where: { token },
    select: { id: true, status: true, expiresAt: true },
  });
  if (!row) throw new HttpError(404, 'This link is not valid');
  return row;
}

export async function publicInfo(token: string) {
  const row = await findByToken(token);
  const expired = row.status === 'sent' && row.expiresAt.getTime() < Date.now();
  return { status: expired ? 'expired' : row.status, expiresAt: row.expiresAt };
}

function cleanAnswers(raw: unknown): Prisma.InputJsonValue {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { throw new HttpError(400, 'The answers could not be read'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'The answers could not be read');
  const answers: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of HR_ONLY_KEYS) delete answers[key];
  // "received" is set by HR when the file arrives, never by the employee
  if (answers.checklist && typeof answers.checklist === 'object') {
    const checklist = answers.checklist as Record<string, { na?: unknown }>;
    answers.checklist = Object.fromEntries(Object.entries(checklist).map(([k, v]) => [k, { na: v?.na === true, received: false }]));
  }
  const json = JSON.stringify(answers);
  if (Buffer.byteLength(json) > MAX_ANSWERS_BYTES) throw new HttpError(400, 'The form is too large');
  return answers as Prisma.InputJsonValue;
}

export async function publicSubmit(token: string, rawAnswers: unknown, uploads: Record<string, Express.Multer.File>, ip: string | null) {
  const row = await findByToken(token);
  if (row.status !== 'sent') throw new HttpError(400, 'This form was already submitted or cancelled');
  if (row.expiresAt.getTime() < Date.now()) throw new HttpError(400, 'This link has expired. Ask HR for a new one.');

  const answers = cleanAnswers(rawAnswers);
  const files: Record<string, StoredFile> = {};
  for (const [key, upload] of Object.entries(uploads)) {
    if (!(FILE_KEYS as readonly string[]).includes(key)) continue;
    const type = detectFileType(upload.buffer);
    files[key] = { storedName: await saveFile(upload.buffer, type.ext), name: cleanFileName(upload.originalname) };
  }

  const result = await prisma.onboardingLink.updateMany({
    where: { id: row.id, status: 'sent' },
    data: { status: 'submitted', answers, files: files as unknown as Prisma.InputJsonValue, submittedAt: new Date(), submittedIp: ip },
  });
  if (result.count === 0) throw new HttpError(409, 'This form was just submitted');
  await logAudit({ actorUserId: null, action: 'onboarding.submit', entity: 'OnboardingLink', entityId: row.id, ip });
  return { ok: true };
}

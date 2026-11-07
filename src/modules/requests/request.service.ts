import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { decrypt, mask } from '../../utils/crypto';
import { saveFile } from '../../utils/fileStorage';
import { notifyEmployee, notifyPermission } from '../../utils/notify';
import { getCompany, getSettings } from '../../utils/settings';
import type { AuthUser } from '../../types/express';
import { renderLetterPdf } from './letter.pdf';
import type { CreateRequestInput, ListRequestsQuery, UpdateTypeInput } from './request.schema';

type Ip = string | null;
const OPEN = ['pending', 'in_progress', 'approved'];

const requestInclude = {
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, country: true, department: { select: { name: true } } } },  type: { select: { id: true, code: true, name: true, category: true } },
  attachment: { select: { id: true, originalName: true } },
  resultDocument: { select: { id: true, originalName: true, visibleToEmployee: true } },
} satisfies Prisma.EmployeeRequestInclude;

const reference = (id: number) => `REQ-${String(id).padStart(5, '0')}`;
const canProcess = (u: AuthUser) => u.permissions.includes('request:process');
const label = (name: string) => (/request$/i.test(name) ? name.toLowerCase() : `${name.toLowerCase()} request`);

// types 

export const listTypes = () => prisma.requestType.findMany({ where: { active: true }, orderBy: { id: 'asc' } });

export async function updateType(id: number, input: UpdateTypeInput, user: AuthUser, ip: Ip) {
  if (!(await prisma.requestType.findUnique({ where: { id } }))) throw new HttpError(404, 'Request type not found');
  return prisma.$transaction(async (tx) => {
    const t = await tx.requestType.update({ where: { id }, data: input });
    await logAudit({ actorUserId: user.id, action: 'request_type.update', entity: 'RequestType', entityId: id,
      changes: { fields: Object.keys(input) }, ip }, tx);
    return t;
  });
}

// requests

export async function create(input: CreateRequestInput, user: AuthUser, ip: Ip) {
  if (!user.employeeId) throw new HttpError(400, 'Your account is not linked to an employee record');
  const employeeId = user.employeeId;
  const type = await prisma.requestType.findFirst({ where: { id: input.typeId, active: true } });
  if (!type) throw new HttpError(400, 'Request type not found');
  if (type.requiresAttachment && !input.attachmentId) throw new HttpError(400, `${type.name} requires a supporting document`);
  if (input.attachmentId) {
    const doc = await prisma.document.findFirst({ where: { id: input.attachmentId, deletedAt: null } });
    if (!doc || doc.employeeId !== employeeId) throw new HttpError(400, 'Attachment not found - upload it first via /api/documents');
  }

  const r = await prisma.$transaction(async (tx) => {
    const created = await tx.employeeRequest.create({
      data: { employeeId, typeId: type.id, purpose: input.purpose, details: input.details, addressedTo: input.addressedTo, attachmentId: input.attachmentId },
      include: requestInclude,
    });
    await logAudit({ actorUserId: user.id, action: 'request.create', entity: 'EmployeeRequest', entityId: created.id,
      changes: { type: type.code, purpose: input.purpose }, ip }, tx);
    return created;
  });

  await notifyPermission('request:process', {
      type: 'request', title: `New ${type.name.toLowerCase()} request`,
      body: `${r.employee.firstName} ${r.employee.lastName} - ${input.purpose}`, link: `/requests/${r.id}`,
    }, r.employee.country);
  return { ...r, reference: reference(r.id) };
}

export async function mine(user: AuthUser) {
  if (!user.employeeId) throw new HttpError(400, 'Your account is not linked to an employee record');
  const rows = await prisma.employeeRequest.findMany({ where: { employeeId: user.employeeId }, include: requestInclude, orderBy: { createdAt: 'desc' } });
  return rows.map((r) => ({ ...r, reference: reference(r.id) }));
}

  export async function list(q: ListRequestsQuery, scope: Prisma.EmployeeWhereInput = {}) {
  const where: Prisma.EmployeeRequestWhereInput = { employee: scope };
  if (q.status) where.status = q.status;
  if (q.typeId) where.typeId = q.typeId;
  if (q.employeeId) where.employeeId = q.employeeId;
  if (q.from || q.to) where.createdAt = { gte: q.from, lte: q.to ? new Date(q.to.getTime() + 86_399_999) : undefined };
  const [total, rows] = await prisma.$transaction([
    prisma.employeeRequest.count({ where }),
    prisma.employeeRequest.findMany({ where, include: requestInclude, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  return { items: rows.map((r) => ({ ...r, reference: reference(r.id) })), page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
}

async function load(id: number) {
  const r = await prisma.employeeRequest.findUnique({ where: { id }, include: requestInclude });
  if (!r) throw new HttpError(404, 'Request not found');
  return r;
}

// Request + its tracking history (from the audit log)
export async function get(id: number, user: AuthUser) {
  const r = await load(id);
  const isOwner = r.employeeId === user.employeeId;
  if (!isOwner && !canProcess(user) && !user.permissions.includes('request:view')) throw new HttpError(403, 'You do not have access to this request');
  const logs = await prisma.auditLog.findMany({ where: { entity: 'EmployeeRequest', entityId: String(id) }, orderBy: { createdAt: 'asc' } });
  const history = logs.map((l) => ({ action: l.action.replace('request.', ''), at: l.createdAt, comment: (l.changes as { comment?: string } | null)?.comment ?? null }));
  // employees only see the generated letter once it is released
  const resultDocument = isOwner && !canProcess(user) && !r.resultDocument?.visibleToEmployee ? null : r.resultDocument;
  return { ...r, resultDocument, reference: reference(id), history };
}

async function setStatus(id: number, from: string[], to: string, user: AuthUser, ip: Ip, extra: Prisma.EmployeeRequestUncheckedUpdateInput = {}, comment?: string) {
  const r = await load(id);
  if (!from.includes(r.status)) throw new HttpError(400, `Request is ${r.status} - cannot change it to ${to}`);
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.employeeRequest.update({ where: { id }, data: { status: to, handledByUserId: user.id, ...extra }, include: requestInclude });
    await logAudit({ actorUserId: user.id, action: `request.${to}`, entity: 'EmployeeRequest', entityId: id,
      changes: { status: { from: r.status, to }, comment: comment ?? null }, ip }, tx);
    return u;
  });
  return { ...updated, reference: reference(id) };
}

export async function start(id: number, user: AuthUser, ip: Ip) {
  const r = await setStatus(id, ['pending'], 'in_progress', user, ip);
  await notifyEmployee(r.employeeId, { type: 'request', title: `Your ${r.type.name.toLowerCase()} request is being processed`, link: `/my/requests/${id}` });
  return r;
}

// letter generation 

function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => values[key] ?? `[${key}]`);
}

const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '-');

export async function generateLetter(id: number, user: AuthUser, ip: Ip) {
  const r = await load(id);
  if (r.type.category !== 'letter') throw new HttpError(400, 'This request type does not produce a letter');
  if (!['pending', 'in_progress'].includes(r.status)) throw new HttpError(400, `Request is ${r.status}`);
  const type = await prisma.requestType.findUniqueOrThrow({ where: { id: r.typeId } });
  if (!type.template) throw new HttpError(400, 'This request type has no letter template');

  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: r.employeeId }, include: { department: { select: { name: true } } } });
  const contract = await prisma.contract.findFirst({ where: { employeeId: emp.id, status: 'active' }, orderBy: { startDate: 'desc' } });
  const usesSalary = /\{\{\s*(basicSalary|housingAllowance|transportAllowance|totalSalary)\s*\}\}/.test(type.template);
  if (usesSalary && !contract) throw new HttpError(400, 'This letter needs salary details, but the employee has no active contract');
  if (/\{\{\s*iban\s*\}\}/.test(type.template) && !emp.bankAccountNumber) throw new HttpError(400, 'This letter needs the employee\'s bank account - add it to their profile first');

  const company = await getCompany();
  const settings = await getSettings();
  const decimals = emp.country === 'SA' ? 2 : 3;
  const money = (v: Prisma.Decimal | undefined) => (v ? Number(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '-');
  const total = contract ? contract.basicSalary.plus(contract.housingAllowance).plus(contract.transportAllowance) : undefined;
  const today = fmtDate(new Date());

  const values: Record<string, string> = {
    employeeName: `${emp.firstName} ${emp.lastName}`,
    employeeCode: emp.employeeCode,
    jobTitle: contract?.jobTitle ?? emp.jobTitle ?? '-',
    department: emp.department?.name ?? '-',
    nationality: emp.nationality ?? '-',
    cprNumber: emp.cprNumber ?? '-',
    hireDate: fmtDate(emp.hireDate),
    basicSalary: money(contract?.basicSalary),
    housingAllowance: money(contract?.housingAllowance),
    transportAllowance: money(contract?.transportAllowance),
    totalSalary: money(total),
    currency: contract?.currency ?? (emp.country === 'SA' ? 'SAR' : 'BHD'),
    bankName: emp.bankName ?? '-',
    iban: emp.bankAccountNumber ? decrypt(emp.bankAccountNumber) : '-',
    addressedTo: r.addressedTo || 'To Whom It May Concern',
    purpose: r.purpose,
    details: r.details ?? '',
    companyName: company.name,
    today,
  };

  const pdf = await renderLetterPdf({
    company, title: type.name, reference: reference(id), date: today, addressedTo: values.addressedTo,
    body: fill(type.template, values), signatoryName: settings.hrSignatoryName, signatoryTitle: settings.hrSignatoryTitle,
  });
  const storedName = await saveFile(pdf, '.pdf');

  const updated = await prisma.$transaction(async (tx) => {
    // replace an earlier draft letter, if HR regenerates
    if (r.resultDocumentId) await tx.document.update({ where: { id: r.resultDocumentId }, data: { deletedAt: new Date() } });
    const doc = await tx.document.create({
      data: {
        employeeId: emp.id, category: 'certificate', title: `${type.name} ${reference(id)}`,
        originalName: `${type.code.toLowerCase()}-${reference(id)}.pdf`, storedName, mimeType: 'application/pdf', size: pdf.length,
        visibleToEmployee: false, // HR reviews before release (requirement 16)
        uploadedByUserId: user.id, notes: `Generated for request ${reference(id)}`,
      },
    });
    const u = await tx.employeeRequest.update({
      where: { id }, data: { status: 'in_progress', handledByUserId: user.id, resultDocumentId: doc.id }, include: requestInclude,
    });
    await logAudit({ actorUserId: user.id, action: 'request.generated', entity: 'EmployeeRequest', entityId: id,
      changes: { documentId: doc.id, iban: values.iban !== '-' ? mask(values.iban) : null }, ip }, tx);
    return u;
  });
  return { ...updated, reference: reference(id) };
}

// HR has reviewed the letter (or the request) and approves it
export async function approve(id: number, comment: string | undefined, user: AuthUser, ip: Ip) {
  const r = await load(id);
  if (r.type.category === 'letter' && !r.resultDocumentId) throw new HttpError(400, 'Generate the letter before approving');
  return setStatus(id, ['pending', 'in_progress'], 'approved', user, ip, { decisionComment: comment }, comment);
}

// Release to the employee letters become visible general requests can attach a file HR uploaded
export async function complete(id: number, documentId: number | undefined, comment: string | undefined, user: AuthUser, ip: Ip) {
  const r = await load(id);
  const extra: Prisma.EmployeeRequestUncheckedUpdateInput = { completedAt: new Date(), decisionComment: comment ?? r.decisionComment };
  if (r.type.category === 'letter') {
    if (r.status !== 'approved') throw new HttpError(400, 'Letters must be approved before they are released');
  } else if (documentId) {
    const doc = await prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!doc || doc.employeeId !== r.employeeId) throw new HttpError(400, 'Document not found for this employee');
    extra.resultDocumentId = documentId;
  }
  const finalDocId = (extra.resultDocumentId as number | undefined) ?? r.resultDocumentId;
  const updated = await setStatus(id, r.type.category === 'letter' ? ['approved'] : OPEN, 'completed', user, ip, extra, comment);
  if (finalDocId) await prisma.document.update({ where: { id: finalDocId }, data: { visibleToEmployee: true } });

  await notifyEmployee(r.employeeId, {
    type: 'request', title: `Your ${r.type.name.toLowerCase()} is ready`,
    body: finalDocId ? 'You can download it from My Requests.' : comment, link: `/my/requests/${id}`,
  });
  return get(id, user);
}

export async function reject(id: number, comment: string, user: AuthUser, ip: Ip) {
  const r = await setStatus(id, OPEN, 'rejected', user, ip, { decisionComment: comment }, comment);
  await notifyEmployee(r.employeeId, { type: 'request', title: `Your ${r.type.name.toLowerCase()} request was rejected`, body: comment, link: `/my/requests/${id}` });
  return r;
}

export async function cancel(id: number, user: AuthUser, ip: Ip) {
  const r = await load(id);
  if (r.employeeId !== user.employeeId) throw new HttpError(403, 'You can only cancel your own requests');
  return setStatus(id, ['pending'], 'cancelled', user, ip);
}
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { getSettings } from '../../utils/settings';
import type { AuthUser } from '../../types/express';
import { CURRENCY } from '../payroll/payroll.rules';
import type { CreateContractInput, ListContractsQuery } from './contract.schema';

const contractInclude = {
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, country: true } },
  document: { select: { id: true, originalName: true } },
} satisfies Prisma.ContractInclude;

type ContractRow = Prisma.ContractGetPayload<{ include: typeof contractInclude }>;

async function alertDays() {
  return Number((await getSettings()).expiryAlertDays) || 30;
}

function daysUntil(date: Date) {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

// Statuses from the requirements: Active, Expiring Soon, Expired, Renewed, Terminated
// "expired" is also shown when an active contract's end date has passed
// state (prototype): Active = current contract, Inactive = replaced by a newer contract, Ended = expired or terminated
function present(c: ContractRow, windowDays: number) {
  let displayStatus = c.status;
  let daysLeft: number | null = null;
  if (c.endDate) daysLeft = daysUntil(c.endDate);
  if (c.status === 'active' && daysLeft !== null) {
    if (daysLeft < 0) displayStatus = 'expired';
    else if (daysLeft <= windowDays) displayStatus = 'expiring_soon';
  }
  const state = c.status === 'renewed' ? 'Inactive' : ['active', 'expiring_soon'].includes(displayStatus) ? 'Active' : 'Ended';
  return { ...c, contractNumber: c.contractNumber ?? `CT-${c.id}`, displayStatus, state, daysLeft };
}

async function nextContractNumber(tx: Prisma.TransactionClient) {
  const year = new Date().getUTCFullYear();
  const prefix = `CT-${year}-`;
  const last = await tx.contract.findFirst({ where: { contractNumber: { startsWith: prefix } }, orderBy: { id: 'desc' }, select: { contractNumber: true } });
  const n = last?.contractNumber ? parseInt(last.contractNumber.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(4, '0')}`;
}

export async function list(q: ListContractsQuery, scope: Prisma.EmployeeWhereInput = {}) {
  const window = await alertDays();
  const where: Prisma.ContractWhereInput = { employee: scope };
  if (q.employeeId) where.employeeId = q.employeeId;
  if (q.status && q.status !== 'expiring_soon') where.status = q.status;
  const days = q.status === 'expiring_soon' ? window : q.expiringWithinDays;
  if (days !== undefined) {
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + days);
    Object.assign(where, { status: 'active', endDate: { not: null, lte: until } });
  }
  const rows = await prisma.contract.findMany({ where, include: contractInclude, orderBy: [{ employeeId: 'asc' }, { startDate: 'desc' }] });
  const result = rows.map((c) => present(c, window));
  return q.state ? result.filter((c) => c.state === q.state) : result;
}

export async function getById(id: number) {
  const c = await prisma.contract.findUnique({ where: { id }, include: contractInclude });
  if (!c) throw new HttpError(404, 'Contract not found');
  return present(c, await alertDays());
}

// Employee self-service: own current contract + history, without salary figures (payroll is HR-only)
export async function mine(user: AuthUser) {
  if (!user.employeeId) throw new HttpError(400, 'Your account is not linked to an employee record');
  const rows = await list({ employeeId: user.employeeId });
  return rows.map(({ basicSalary: _b, housingAllowance: _h, transportAllowance: _t, currency: _c, ...rest }) => rest);
}

// BR-4.10: a new contract becomes the single active one; the previous active contract is marked "renewed"
export async function create(input: CreateContractInput, user: AuthUser, ip: string | null) {
  const emp = await prisma.employee.findUnique({
    where: { id: input.employeeId }, select: { id: true, country: true, status: true, jobTitle: true, employmentType: true },
  });
  if (!emp) throw new HttpError(404, 'Employee not found');
  if (emp.status !== 'active') throw new HttpError(400, 'Employee is not active');
  // interns are paid a stipend through an internship contract, and only interns get one
  const isIntern = emp.employmentType === 'Intern';
  if (isIntern && input.contractType !== 'internship') throw new HttpError(400, 'Interns need an internship contract (basicSalary = monthly stipend)');
  if (!isIntern && input.contractType === 'internship') throw new HttpError(400, 'Internship contracts are only for interns');
  if (isIntern) Object.assign(input, { housingAllowance: 0, transportAllowance: 0 });
  if (input.documentId) {
    const doc = await prisma.document.findFirst({ where: { id: input.documentId, deletedAt: null } });
    if (!doc || doc.employeeId !== emp.id) throw new HttpError(400, 'Contract document not found for this employee');
  }

  const previous = await prisma.contract.findFirst({ where: { employeeId: emp.id, status: 'active' } });

  const contract = await prisma.$transaction(async (tx) => {
    if (previous) await tx.contract.update({ where: { id: previous.id }, data: { status: 'renewed' } });
    const c = await tx.contract.create({
      data: {
        employeeId: emp.id,
        contractNumber: await nextContractNumber(tx),
        contractType: input.contractType,
        jobTitle: input.jobTitle ?? emp.jobTitle,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        basicSalary: input.basicSalary,
        housingAllowance: input.housingAllowance,
        transportAllowance: input.transportAllowance,
        weeklyHours: input.weeklyHours ?? null,
        currency: CURRENCY[emp.country]?.code ?? 'BHD',
        documentId: input.documentId ?? null,
        notes: input.notes,
        createdByUserId: user.id,
      },
      include: contractInclude,
    });
    // salary changes are always audited
    await logAudit({
      actorUserId: user.id, action: 'contract.create', entity: 'Contract', entityId: c.id,
      changes: {
        employeeId: emp.id,
        contractNumber: c.contractNumber,
        replacedContractId: previous?.id ?? null,
        basicSalary: { from: previous?.basicSalary.toFixed() ?? null, to: c.basicSalary.toFixed() },
        housingAllowance: { from: previous?.housingAllowance.toFixed() ?? null, to: c.housingAllowance.toFixed() },
        transportAllowance: { from: previous?.transportAllowance.toFixed() ?? null, to: c.transportAllowance.toFixed() },
      },
      ip,
    }, tx);
    return c;
  });
  return present(contract, await alertDays());
}

async function closeContract(id: number, status: 'expired' | 'terminated', reason: string | null, user: AuthUser, ip: string | null) {
  const c = await prisma.contract.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, 'Contract not found');
  if (c.status !== 'active') throw new HttpError(400, `Contract is already ${c.status}`);
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.contract.update({
      where: { id },
      data: { status, notes: reason ? [c.notes, `Terminated: ${reason}`].filter(Boolean).join('\n').slice(0, 500) : c.notes },
      include: contractInclude,
    });
    await logAudit({ actorUserId: user.id, action: `contract.${status === 'expired' ? 'expire' : 'terminate'}`, entity: 'Contract', entityId: id, changes: { reason }, ip }, tx);
    return u;
  });
  return present(updated, await alertDays());
}

export const expire = (id: number, user: AuthUser, ip: string | null) => closeContract(id, 'expired', null, user, ip);
export const terminate = (id: number, reason: string, user: AuthUser, ip: string | null) => closeContract(id, 'terminated', reason, user, ip);
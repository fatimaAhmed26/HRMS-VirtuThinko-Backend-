import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { decrypt } from '../../utils/crypto';
import type { AuthUser } from '../../types/express';
import { calculatePayslip } from './payroll.calc';
import { periodRange } from './payroll.rules';
import type { CreateItemInput, CreateItemTypeInput, ListItemsQuery } from './payroll.schema';

type Ip = string | null;
const RELEASED = ['processed', 'paid']; // payslips visible to employees

// ───────────── payroll runs ─────────────

async function computeLines(period: string) {
  const { end } = periodRange(period);
  const employees = await prisma.employee.findMany({
    where: { status: 'active', OR: [{ hireDate: null }, { hireDate: { lte: end } }] },
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
    orderBy: { id: 'asc' },
  });

  const payslips: Prisma.PayslipUncheckedCreateInput[] = [];
  const warnings: { employeeId: number; employee: string; message: string; skipped: boolean }[] = [];
  for (const e of employees) {
    const label = `${e.employeeCode} ${e.firstName} ${e.lastName}`;
    const r = await calculatePayslip(e.id, period);
    if (!r.ok) {
      warnings.push({ employeeId: e.id, employee: label, message: r.reason, skipped: true });
      continue;
    }
    payslips.push({ ...r.payslip, runId: 0 });
    r.warnings.forEach((w) => warnings.push({ employeeId: e.id, employee: label, message: w, skipped: false }));
  }
  return { payslips, warnings };
}

export async function createRun(period: string, user: AuthUser, ip: Ip) {
  if (await prisma.payrollRun.findUnique({ where: { period } })) throw new HttpError(409, `A payroll run for ${period} already exists`);
  const { payslips, warnings } = await computeLines(period);

  const run = await prisma.$transaction(async (tx) => {
    const r = await tx.payrollRun.create({
      data: { period, createdByUserId: user.id, warnings: warnings as unknown as Prisma.InputJsonValue },
    });
    await tx.payslip.createMany({ data: payslips.map((p) => ({ ...p, runId: r.id })) });
    await logAudit({ actorUserId: user.id, action: 'payroll.create', entity: 'PayrollRun', entityId: r.id,
      changes: { period, employees: payslips.length, warnings: warnings.length }, ip }, tx);
    return r;
  });
  return getRun(run.id);
}

// Re-read contracts, items and leave (only while in draft)
export async function recalculate(id: number, user: AuthUser, ip: Ip) {
  const run = await findRun(id);
  if (run.status !== 'draft') throw new HttpError(400, 'Only draft payroll can be recalculated - return it to draft first');
  const { payslips, warnings } = await computeLines(run.period);

  await prisma.$transaction(async (tx) => {
    await tx.payslip.deleteMany({ where: { runId: id } });
    await tx.payslip.createMany({ data: payslips.map((p) => ({ ...p, runId: id })) });
    await tx.payrollRun.update({ where: { id }, data: { warnings: warnings as unknown as Prisma.InputJsonValue } });
    await logAudit({ actorUserId: user.id, action: 'payroll.recalculate', entity: 'PayrollRun', entityId: id,
      changes: { employees: payslips.length }, ip }, tx);
  });
  return getRun(id);
}

async function findRun(id: number) {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw new HttpError(404, 'Payroll run not found');
  return run;
}

async function totalsFor(runIds: number[]) {
  const rows = await prisma.payslip.groupBy({
    by: ['runId', 'currency'],
    where: { runId: { in: runIds } },
    _count: { _all: true },
    _sum: { grossSalary: true, totalDeductions: true, netSalary: true },
  });
  return rows.map((r) => ({
    runId: r.runId, currency: r.currency, employees: r._count._all,
    gross: r._sum.grossSalary, deductions: r._sum.totalDeductions, net: r._sum.netSalary,
  }));
}

export async function listRuns() {
  const runs = await prisma.payrollRun.findMany({ orderBy: { period: 'desc' } });
  const totals = await totalsFor(runs.map((r) => r.id));
  return runs.map((r) => ({ ...r, totals: totals.filter((t) => t.runId === r.id).map(({ runId: _, ...t }) => t) }));
}

export async function getRun(id: number) {
  const run = await findRun(id);
  const payslips = await prisma.payslip.findMany({
    where: { runId: id },
    select: { id: true, employeeId: true, employeeCode: true, employeeName: true, department: true, currency: true,
      grossSalary: true, totalDeductions: true, netSalary: true },
    orderBy: { employeeCode: 'asc' },
  });
  const totals = (await totalsFor([id])).map(({ runId: _, ...t }) => t);
  return { ...run, totals, payslips };
}

// Status workflow: draft -> under_review -> approved -> processed -> paid  (return: back to draft)
const TRANSITIONS = {
  submit: { from: ['draft'], to: 'under_review' },
  approve: { from: ['under_review'], to: 'approved' },
  return: { from: ['under_review', 'approved'], to: 'draft' },
  process: { from: ['approved'], to: 'processed' },
  pay: { from: ['processed'], to: 'paid' },
} as const;
export type RunAction = keyof typeof TRANSITIONS;

export async function transition(id: number, action: RunAction, comment: string | undefined, user: AuthUser, ip: Ip) {
  const run = await findRun(id);
  const rule = TRANSITIONS[action];
  if (!(rule.from as readonly string[]).includes(run.status)) {
    throw new HttpError(400, `Cannot ${action} a payroll that is ${run.status}`);
  }

  const data: Prisma.PayrollRunUpdateInput = {};
  if (action === 'submit') {
    const count = await prisma.payslip.count({ where: { runId: id } });
    if (count === 0) throw new HttpError(400, 'Payroll has no employees');
    data.status = 'under_review';
  }
  if (action === 'approve') {
    // separation of duties: whoever prepared the payroll cannot approve it
    if (run.createdByUserId === user.id) throw new HttpError(403, 'You cannot approve a payroll you prepared');
    Object.assign(data, { status: 'approved', approvedByUserId: user.id, approvedAt: new Date() });
  }
  if (action === 'return') Object.assign(data, { status: 'draft', approvedByUserId: null, approvedAt: null });
  if (action === 'process') Object.assign(data, { status: 'processed', processedAt: new Date() });
  if (action === 'pay') Object.assign(data, { status: 'paid', paidAt: new Date() });

  await prisma.$transaction(async (tx) => {
    await tx.payrollRun.update({ where: { id }, data });
    await logAudit({ actorUserId: user.id, action: `payroll.${action}`, entity: 'PayrollRun', entityId: id,
      changes: { status: { from: run.status, to: data.status as string }, comment: comment ?? null }, ip }, tx);
  });
  return getRun(id);
}

export async function deleteRun(id: number, user: AuthUser, ip: Ip) {
  const run = await findRun(id);
  if (run.status !== 'draft') throw new HttpError(400, 'Only draft payroll can be deleted');
  await prisma.$transaction(async (tx) => {
    await tx.payrollRun.delete({ where: { id } });
    await logAudit({ actorUserId: user.id, action: 'payroll.delete', entity: 'PayrollRun', entityId: id, changes: { period: run.period }, ip }, tx);
  });
}

// FR-4.4: bank transfer file (CSV) - only once approved
export async function bankFile(id: number, user: AuthUser, ip: Ip) {
  const run = await findRun(id);
  if (!['approved', 'processed', 'paid'].includes(run.status)) throw new HttpError(400, 'Payroll must be approved first');
  const slips = await prisma.payslip.findMany({
    where: { runId: id },
    include: { employee: { select: { bankName: true, bankAccountNumber: true } } },
    orderBy: { employeeCode: 'asc' },
  });

  const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = ['EmployeeCode,EmployeeName,BankName,IBAN,Currency,NetAmount'];
  const missing: string[] = [];
  for (const s of slips) {
    const iban = s.employee.bankAccountNumber ? decrypt(s.employee.bankAccountNumber) : '';
    if (!iban) missing.push(s.employeeCode);
    lines.push([s.employeeCode, s.employeeName, s.employee.bankName ?? '', iban, s.currency, s.netSalary.toFixed()].map(csv).join(','));
  }
  await logAudit({ actorUserId: user.id, action: 'payroll.bank_export', entity: 'PayrollRun', entityId: id,
    changes: { employees: slips.length, missingBankDetails: missing }, ip });
  return { filename: `payroll-${run.period}-bank.csv`, content: lines.join('\r\n') + '\r\n', missing };
}

// ───────────── payslips ─────────────

export async function myPayslips(user: AuthUser) {
  if (!user.employeeId) throw new HttpError(400, 'Your account is not linked to an employee record');
  return prisma.payslip.findMany({
    where: { employeeId: user.employeeId, run: { status: { in: RELEASED } } },
    select: { id: true, currency: true, grossSalary: true, totalDeductions: true, netSalary: true, run: { select: { period: true, status: true } } },
    orderBy: { run: { period: 'desc' } },
  });
}

export async function getPayslip(id: number, user: AuthUser) {
  const slip = await prisma.payslip.findUnique({ where: { id }, include: { run: { select: { period: true, status: true } } } });
  if (!slip) throw new HttpError(404, 'Payslip not found');
  const isOwner = slip.employeeId === user.employeeId && RELEASED.includes(slip.run.status);
  if (!isOwner && !user.permissions.includes('payroll:view')) throw new HttpError(403, 'You do not have access to this payslip');
  return slip;
}

// ───────────── allowance & deduction categories ─────────────

export const listItemTypes = () => prisma.payItemType.findMany({ where: { active: true }, orderBy: [{ kind: 'asc' }, { id: 'asc' }] });

export async function createItemType(input: CreateItemTypeInput, user: AuthUser, ip: Ip) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.payItemType.create({ data: { ...input, contributory: input.contributory ?? false } });
    await logAudit({ actorUserId: user.id, action: 'pay_item_type.create', entity: 'PayItemType', entityId: t.id, changes: input, ip }, tx);
    return t;
  });
}

// ───────────── allowances & deductions per employee ─────────────

const itemInclude = {
  type: { select: { code: true, name: true, kind: true } },
  employee: { select: { employeeCode: true, firstName: true, lastName: true } },
} satisfies Prisma.PayItemInclude;

export async function createItem(input: CreateItemInput, user: AuthUser, ip: Ip) {
  const emp = await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } });
  if (!emp) throw new HttpError(404, 'Employee not found');
  const type = await prisma.payItemType.findFirst({ where: { id: input.typeId, active: true } });
  if (!type) throw new HttpError(400, 'Allowance/deduction type not found');

  const toPeriod = input.recurring ? input.toPeriod ?? null : input.fromPeriod; // one-time = that month only
  return prisma.$transaction(async (tx) => {
    const item = await tx.payItem.create({
      data: { employeeId: input.employeeId, typeId: type.id, amount: input.amount, recurring: input.recurring,
        fromPeriod: input.fromPeriod, toPeriod, reason: input.reason, createdByUserId: user.id },
      include: itemInclude,
    });
    await logAudit({ actorUserId: user.id, action: 'pay_item.create', entity: 'PayItem', entityId: item.id,
      changes: { employeeId: input.employeeId, type: type.code, amount: input.amount, recurring: input.recurring, fromPeriod: input.fromPeriod, toPeriod }, ip }, tx);
    return item;
  });
}

export async function listItems(q: ListItemsQuery) {
  const where: Prisma.PayItemWhereInput = {};
  if (q.employeeId) where.employeeId = q.employeeId;
  if (q.status) where.status = q.status;
  if (q.period) Object.assign(where, { fromPeriod: { lte: q.period }, OR: [{ recurring: true, toPeriod: null }, { toPeriod: { gte: q.period } }] });
  return prisma.payItem.findMany({ where, include: itemInclude, orderBy: { createdAt: 'desc' } });
}

export async function decideItem(id: number, decision: 'approved' | 'rejected', user: AuthUser, ip: Ip) {
  const item = await prisma.payItem.findUnique({ where: { id } });
  if (!item) throw new HttpError(404, 'Item not found');
  if (item.status !== 'pending') throw new HttpError(400, `Item is already ${item.status}`);
  if (item.createdByUserId === user.id) throw new HttpError(403, 'You cannot approve an item you entered');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payItem.update({
      where: { id }, data: { status: decision, approvedByUserId: user.id, approvedAt: new Date() }, include: itemInclude,
    });
    await logAudit({ actorUserId: user.id, action: `pay_item.${decision === 'approved' ? 'approve' : 'reject'}`, entity: 'PayItem', entityId: id, ip }, tx);
    return updated;
  });
}

// End a recurring item (e.g. loan fully repaid)
export async function stopItem(id: number, toPeriod: string, user: AuthUser, ip: Ip) {
  const item = await prisma.payItem.findUnique({ where: { id } });
  if (!item) throw new HttpError(404, 'Item not found');
  if (!item.recurring) throw new HttpError(400, 'Only recurring items can be stopped');
  if (toPeriod < item.fromPeriod) throw new HttpError(400, 'toPeriod is before the item starts');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.payItem.update({ where: { id }, data: { toPeriod }, include: itemInclude });
    await logAudit({ actorUserId: user.id, action: 'pay_item.stop', entity: 'PayItem', entityId: id,
      changes: { toPeriod: { from: item.toPeriod, to: toPeriod } }, ip }, tx);
    return updated;
  });
}

export async function deleteItem(id: number, user: AuthUser, ip: Ip) {
  const item = await prisma.payItem.findUnique({ where: { id } });
  if (!item) throw new HttpError(404, 'Item not found');
  if (item.status === 'approved') throw new HttpError(400, 'Approved items cannot be deleted - stop them instead');
  await prisma.$transaction(async (tx) => {
    await tx.payItem.delete({ where: { id } });
    await logAudit({ actorUserId: user.id, action: 'pay_item.delete', entity: 'PayItem', entityId: id, ip }, tx);
  });
}
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import type { AuthUser } from '../../types/express';
import { countDays, monthsOfService, payBreakdown, tiersOf, toDateKey, yearlyEntitlement } from './leave.rules';
import type { CreateRequestInput, ListRequestsQuery, UpdateTypeInput } from './leave.schema';

const ACTIVE_STATUSES = ['pending_manager', 'pending_hr', 'approved'];
const PENDING_STATUSES = ['pending_manager', 'pending_hr'];

const requestInclude = {
  employee: {
    select: { id: true, employeeCode: true, firstName: true, lastName: true, managerId: true, country: true,
      department: { select: { id: true, name: true } } },
  },
  leaveType: { select: { id: true, code: true, name: true, country: true } },
  approvals: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.LeaveRequestInclude;

const canManage = (u: AuthUser) => u.permissions.includes('leave:manage');

function requireEmployee(user: AuthUser) {
  if (!user.employeeId) throw new HttpError(400, 'Your account is not linked to an employee record');
  return user.employeeId;
}

function yearRange(year: number) {
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

async function holidaySet(country: string, start: Date, end: Date) {
  const rows = await prisma.publicHoliday.findMany({ where: { country, date: { gte: start, lte: end } } });
  return new Set(rows.map((h) => toDateKey(h.date)));
}

// Days of this type already used (approved) or reserved (pending) in a year
async function usedDays(employeeId: number, leaveTypeId: number, year: number) {
  const rows = await prisma.leaveRequest.groupBy({
    by: ['status'],
    where: { employeeId, leaveTypeId, status: { in: ACTIVE_STATUSES }, startDate: yearRange(year) },
    _sum: { days: true },
  });
  const approved = rows.filter((r) => r.status === 'approved').reduce((s, r) => s + (r._sum.days ?? 0), 0);
  const pending = rows.filter((r) => r.status !== 'approved').reduce((s, r) => s + (r._sum.days ?? 0), 0);
  return { approved, pending };
}

// ───────────── Leave types & holidays ─────────────

export async function listTypes(country: string) {
  return prisma.leaveType.findMany({ where: { country, active: true }, orderBy: { id: 'asc' } });
}

export async function updateType(id: number, input: UpdateTypeInput, actor: AuthUser, ip: string | null) {
  const before = await prisma.leaveType.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'Leave type not found');
  const { payTiers, ...rest } = input;
  const data: Prisma.LeaveTypeUpdateInput = { ...rest };
  if (payTiers !== undefined) data.payTiers = payTiers === null ? Prisma.DbNull : payTiers;

  return prisma.$transaction(async (tx) => {
    const t = await tx.leaveType.update({ where: { id }, data });
    await logAudit(
      { actorUserId: actor.id, action: 'leave_type.update', entity: 'LeaveType', entityId: id,
        changes: JSON.parse(JSON.stringify(input)), ip },
      tx
    );
    return t;
  });
}

export async function listHolidays(country?: string, year?: number) {
  return prisma.publicHoliday.findMany({
    where: { country, date: year ? yearRange(year) : undefined },
    orderBy: { date: 'asc' },
  });
}

export async function addHoliday(data: { country: string; date: Date; name: string }) {
  return prisma.publicHoliday.create({ data });
}

export async function deleteHoliday(id: number) {
  await prisma.publicHoliday.delete({ where: { id } });
}

// ───────────── Balances ─────────────

export async function balances(employeeId: number, year = new Date().getUTCFullYear()) {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, firstName: true, lastName: true, country: true, gender: true, hireDate: true },
  });
  if (!emp) throw new HttpError(404, 'Employee not found');

  const types = await listTypes(emp.country);
  const asOf = new Date();
  const result = [];

  for (const t of types) {
    if (t.gender && emp.gender && t.gender !== emp.gender) continue; // hide e.g. maternity for men
    if (t.allowance === 'yearly') {
      const entitlement = yearlyEntitlement(t, emp.hireDate, asOf);
      const { approved, pending } = await usedDays(emp.id, t.id, year);
      result.push({
        leaveTypeId: t.id, code: t.code, name: t.name, allowance: t.allowance,
        entitlement, used: approved, pending, remaining: entitlement - approved - pending,
        payTiers: t.payTiers,
      });
    } else {
      result.push({ leaveTypeId: t.id, code: t.code, name: t.name, allowance: t.allowance, daysPerEvent: t.days, payTiers: t.payTiers });
    }
  }

  return { employee: emp, year, balances: result };
}

// ───────────── Requests ─────────────

export async function createRequest(input: CreateRequestInput, user: AuthUser, ip: string | null) {
  const employeeId = requireEmployee(user);
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, status: true, country: true, gender: true, hireDate: true, managerId: true,
      manager: { select: { status: true, user: { select: { status: true } } } } },
  });
  if (!emp || emp.status !== 'active') throw new HttpError(400, 'Employee record is not active');

  const type = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } });
  if (!type || !type.active) throw new HttpError(400, 'Leave type not found');
  if (type.country !== emp.country) throw new HttpError(400, `This leave type does not apply to ${emp.country} employees`);

  // eligibility
  if (type.gender) {
    if (!emp.gender) throw new HttpError(400, 'Your gender is not set on your employee record; contact HR');
    if (type.gender !== emp.gender) throw new HttpError(400, `${type.name} is only available to ${type.gender} employees`);
  }
  if (type.minServiceMonths > 0) {
    if (!emp.hireDate) throw new HttpError(400, 'Your hire date is not set; contact HR');
    const months = monthsOfService(emp.hireDate, input.startDate);
    if (months < type.minServiceMonths) {
      throw new HttpError(400, `${type.name} requires ${type.minServiceMonths} months of service (you have ${months})`);
    }
  }
  if (type.requiresAttachment && !input.attachmentUrl) throw new HttpError(400, `${type.name} requires a supporting document`);
  if (type.oncePerEmployment) {
    const before = await prisma.leaveRequest.count({ where: { employeeId, leaveTypeId: type.id, status: { in: ACTIVE_STATUSES } } });
    if (before > 0) throw new HttpError(400, `${type.name} can only be taken once during employment`);
  }

  // no overlapping requests
  const overlap = await prisma.leaveRequest.findFirst({
    where: { employeeId, status: { in: ACTIVE_STATUSES }, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } },
  });
  if (overlap) throw new HttpError(409, `Overlaps with another leave request (#${overlap.id})`);

  // day count
  const holidays = type.countWorkingDays ? await holidaySet(emp.country, input.startDate, input.endDate) : new Set<string>();
  const days = countDays(input.startDate, input.endDate, type.countWorkingDays, holidays);
  if (days === 0) throw new HttpError(400, 'The selected dates contain no working days');

  // balance / limit
  let alreadyUsed = 0;
  if (type.allowance === 'yearly') {
    const year = input.startDate.getUTCFullYear();
    if (input.endDate.getUTCFullYear() !== year) throw new HttpError(400, 'Split requests that cross into a new year');
    const entitlement = yearlyEntitlement(type, emp.hireDate, input.startDate);
    const { approved, pending } = await usedDays(employeeId, type.id, year);
    alreadyUsed = approved + pending;
    const remaining = entitlement - alreadyUsed;
    if (days > remaining) throw new HttpError(400, `Not enough balance: requested ${days} days, remaining ${remaining}`);
  } else if (days > type.days) {
    throw new HttpError(400, `${type.name} is limited to ${type.days} days`);
  }

  const breakdown = payBreakdown(tiersOf(type, type.days), alreadyUsed, days);

  // approval route: direct manager (if they can log in), otherwise straight to HR
  const managerCanApprove = emp.managerId && emp.manager?.status === 'active' && emp.manager.user?.status === 'active';
  const status = managerCanApprove ? 'pending_manager' : 'pending_hr';

  return prisma.$transaction(async (tx) => {
    const r = await tx.leaveRequest.create({
      data: {
        employeeId, leaveTypeId: type.id, startDate: input.startDate, endDate: input.endDate,
        days, reason: input.reason, attachmentUrl: input.attachmentUrl, status, payBreakdown: breakdown,
      },
      include: requestInclude,
    });
    await logAudit(
      { actorUserId: user.id, action: 'leave.request', entity: 'LeaveRequest', entityId: r.id,
        changes: { type: type.code, startDate: toDateKey(input.startDate), endDate: toDateKey(input.endDate), days }, ip },
      tx
    );
    return r;
  });
}

export async function myRequests(user: AuthUser) {
  const employeeId = requireEmployee(user);
  return prisma.leaveRequest.findMany({ where: { employeeId }, include: requestInclude, orderBy: { createdAt: 'desc' } });
}

// Requests waiting for this user's decision
export async function pendingApprovals(user: AuthUser) {
  const or: Prisma.LeaveRequestWhereInput[] = [];
  if (user.employeeId && user.permissions.includes('leave:approve')) {
    or.push({ status: 'pending_manager', employee: { managerId: user.employeeId } });
  }
  if (canManage(user)) or.push({ status: 'pending_hr' });
  if (or.length === 0) return [];

  return prisma.leaveRequest.findMany({
    where: { OR: or, NOT: user.employeeId ? { employeeId: user.employeeId } : undefined },
    include: requestInclude,
    orderBy: { startDate: 'asc' },
  });
}

export async function listRequests(q: ListRequestsQuery) {
  const where: Prisma.LeaveRequestWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.employeeId) where.employeeId = q.employeeId;
  if (q.leaveTypeId) where.leaveTypeId = q.leaveTypeId;
  if (q.departmentId) where.employee = { departmentId: q.departmentId };
  if (q.from) where.endDate = { gte: q.from };
  if (q.to) where.startDate = { lte: q.to };

  const [total, items] = await prisma.$transaction([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.findMany({
      where, include: requestInclude, orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize, take: q.pageSize,
    }),
  ]);
  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
}

async function loadRequest(id: number) {
  const r = await prisma.leaveRequest.findUnique({ where: { id }, include: requestInclude });
  if (!r) throw new HttpError(404, 'Leave request not found');
  return r;
}

const isOwner = (r: { employeeId: number }, u: AuthUser) => u.employeeId === r.employeeId;
const isManagerOf = (r: { employee: { managerId: number | null } }, u: AuthUser) =>
  !!u.employeeId && r.employee.managerId === u.employeeId && u.permissions.includes('leave:approve');

export async function getRequest(id: number, user: AuthUser) {
  const r = await loadRequest(id);
  if (!isOwner(r, user) && !isManagerOf(r, user) && !canManage(user)) {
    throw new HttpError(403, 'You do not have access to this leave request');
  }
  return r;
}

// Approve or reject at the current stage
export async function decide(id: number, decision: 'approved' | 'rejected', comment: string | undefined, user: AuthUser, approverName: string, ip: string | null) {
  const r = await loadRequest(id);
  if (isOwner(r, user)) throw new HttpError(403, 'You cannot approve or reject your own leave');

  let stage: 'manager' | 'hr';
  if (r.status === 'pending_manager' && isManagerOf(r, user)) stage = 'manager';
  else if (PENDING_STATUSES.includes(r.status) && canManage(user)) stage = 'hr'; // HR can act at either stage
  else if (!PENDING_STATUSES.includes(r.status)) throw new HttpError(400, `Request is already ${r.status}`);
  else throw new HttpError(403, 'You are not an approver for this request');

  const nextStatus = decision === 'rejected' ? 'rejected' : stage === 'manager' ? 'pending_hr' : 'approved';

  return prisma.$transaction(async (tx) => {
    await tx.leaveApproval.create({
      data: { requestId: id, stage, decision, comment, approverUserId: user.id, approverName },
    });
    const updated = await tx.leaveRequest.update({ where: { id }, data: { status: nextStatus }, include: requestInclude });
    await logAudit(
      { actorUserId: user.id, action: `leave.${decision === 'approved' ? 'approve' : 'reject'}`, entity: 'LeaveRequest',
        entityId: id, changes: { stage, status: { from: r.status, to: nextStatus }, comment: comment ?? null }, ip },
      tx
    );
    return updated;
  });
}

export async function cancel(id: number, user: AuthUser, ip: string | null) {
  const r = await loadRequest(id);
  const ownerCancellingPending = isOwner(r, user) && PENDING_STATUSES.includes(r.status);
  const hrCancelling = canManage(user) && ACTIVE_STATUSES.includes(r.status);
  if (!ownerCancellingPending && !hrCancelling) {
    throw new HttpError(400, r.status === 'approved' ? 'Approved leave can only be cancelled by HR' : `Request is already ${r.status}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.leaveRequest.update({ where: { id }, data: { status: 'cancelled' }, include: requestInclude });
    await logAudit(
      { actorUserId: user.id, action: 'leave.cancel', entity: 'LeaveRequest', entityId: id,
        changes: { status: { from: r.status, to: 'cancelled' } }, ip },
      tx
    );
    return updated;
  });
}
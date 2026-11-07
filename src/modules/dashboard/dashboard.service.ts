import prisma from '../../config/prisma';
import { getSettings } from '../../utils/settings';
import type { AuthUser } from '../../types/express';
import { balances } from '../leave/leave.service';
import { forMe } from '../announcements/announcement.service';
import { employeeScope, entitiesOf } from '../../utils/scope';

const todayUtc = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const currentPeriod = () => new Date().toISOString().slice(0, 7);

// HR dashboard - only counts the entities this user can see (BH / SA / both)
export async function adminDashboard(user: AuthUser) {
  const today = todayUtc();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const window = Number((await getSettings()).expiryAlertDays) || 30;
  const until = new Date(today);
  until.setUTCDate(until.getUTCDate() + window);
  const entities = await entitiesOf(user);
  const emp = await employeeScope(user);

  const [statusCounts, onLeave, newHires, pendingLeave, pendingRequests, pendingPayItems, expiringContracts, expiringDocuments, runs, byDept, departments] =
    await Promise.all([
      prisma.employee.groupBy({ by: ['status'], where: emp, _count: { _all: true } }),
      prisma.leaveRequest.findMany({
        where: { status: 'approved', startDate: { lte: today }, endDate: { gte: today }, employee: emp },
        distinct: ['employeeId'], select: { employeeId: true },
      }),
      prisma.employee.count({ where: { ...emp, hireDate: { gte: monthStart } } }),
      prisma.leaveRequest.groupBy({ by: ['status'], where: { status: { in: ['pending_manager', 'pending_hr'] }, employee: emp }, _count: { _all: true } }),
      prisma.employeeRequest.count({ where: { status: { in: ['pending', 'in_progress', 'approved'] }, employee: emp } }),
      prisma.payItem.count({ where: { status: 'pending', employee: emp } }),
      prisma.contract.count({ where: { status: 'active', endDate: { not: null, lte: until }, employee: emp } }),
      prisma.document.count({ where: { deletedAt: null, expiryDate: { not: null, lte: until }, employee: emp } }),
      prisma.payrollRun.findMany({ where: { entity: { in: entities } }, orderBy: { period: 'desc' } }),
      prisma.employee.groupBy({ by: ['departmentId'], where: { ...emp, status: 'active' }, _count: { _all: true } }),
      prisma.department.findMany({ select: { id: true, name: true } }),
    ]);

  const count = (s: string) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  // latest payroll run of each entity
  const latestRuns = [];
  for (const entity of entities) {
    const run = runs.find((r) => r.entity === entity);
    if (!run) continue;
    const totals = (await prisma.payslip.groupBy({ by: ['currency'], where: { runId: run.id }, _sum: { netSalary: true }, _count: { _all: true } }))
      .map((t) => ({ currency: t.currency, employees: t._count._all, net: t._sum.netSalary }));
    latestRuns.push({ id: run.id, entity, period: run.period, status: run.status, totals });
  }
  const announcements = (await forMe(user)).slice(0, 5);

  return {
    entities,
    employees: {
      total: count('active') + count('inactive'),
      active: count('active'),
      inactive: count('inactive'),
      onLeaveToday: onLeave.length,
      newHiresThisMonth: newHires,
    },
    pending: {
      leaveWithManager: pendingLeave.find((p) => p.status === 'pending_manager')?._count._all ?? 0,
      leaveWithHr: pendingLeave.find((p) => p.status === 'pending_hr')?._count._all ?? 0,
      hrRequests: pendingRequests,
      payItemsToApprove: pendingPayItems,
    },
    expiring: { withinDays: window, contracts: expiringContracts, documents: expiringDocuments },
    payroll: { currentPeriod: currentPeriod(), latestRuns },
    headcountByDepartment: byDept
      .map((d) => ({ departmentId: d.departmentId, department: d.departmentId ? deptName.get(d.departmentId) ?? '-' : 'Unassigned', employees: d._count._all }))
      .sort((a, b) => b.employees - a.employees),
    recentAnnouncements: announcements,
  };
}

// Employee home - no payroll information (payroll is HR-only)
export async function employeeHome(user: AuthUser) {
  const unreadNotifications = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  const announcements = await forMe(user, 5);
  if (!user.employeeId) return { employee: null, unreadNotifications, announcements };

  const employeeId = user.employeeId;
  const [emp, leave, pendingLeave, pendingRequests, contract] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { firstName: true, lastName: true, employeeCode: true, jobTitle: true, photoUrl: true } }),
    balances(employeeId),
    prisma.leaveRequest.count({ where: { employeeId, status: { in: ['pending_manager', 'pending_hr'] } } }),
    prisma.employeeRequest.count({ where: { employeeId, status: { in: ['pending', 'in_progress', 'approved'] } } }),
    prisma.contract.findFirst({ where: { employeeId, status: 'active' }, orderBy: { startDate: 'desc' }, select: { id: true, contractNumber: true, contractType: true, endDate: true } }),
  ]);

  const annual = leave.balances.find((b) => b.code === 'ANNUAL');
  const daysLeft = contract?.endDate ? Math.round((contract.endDate.getTime() - todayUtc().getTime()) / 86_400_000) : null;

  return {
    employee: emp,
    cards: {
      remainingLeave: annual && 'remaining' in annual ? annual.remaining : null,
      pendingRequests: pendingLeave + pendingRequests,
      contract: contract ? { ...contract, daysLeft } : null,
    },
    leaveBalances: leave.balances.filter((b) => b.allowance === 'yearly'),
    unreadNotifications,
    announcements,
  };
}
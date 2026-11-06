import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { balances } from '../leave/leave.service';

export type Cell = string | number | null;
export interface ReportResult {
  title: string;
  subtitle?: string;
  columns: { key: string; label: string; width?: number; numeric?: boolean }[];
  rows: Record<string, Cell>[];
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').transform((s) => new Date(`${s}T00:00:00.000Z`));
export const reportQuerySchema = z.object({
  format: z.enum(['json', 'xlsx', 'pdf']).default('json'),
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: z.string().trim().max(30).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  country: z.enum(['BH', 'SA']).optional(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM').optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  days: z.coerce.number().int().min(0).max(365).default(60),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : null);
const n = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? null : Number(v));
const name = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const daysLeft = (date: Date) => Math.round((date.getTime() - todayUtc().getTime()) / 86_400_000);
const range = (q: ReportQuery) => {
  const to = q.to ?? todayUtc();
  const from = q.from ?? new Date(Date.UTC(to.getUTCFullYear(), 0, 1));
  return { from, to, toEnd: new Date(to.getTime() + 86_399_999), label: `${d(from)} to ${d(to)}` };
};

interface ReportDef {
  title: string;
  description: string;
  permissions: string[];
  build: (q: ReportQuery) => Promise<ReportResult>;
}

export const REPORTS: Record<string, ReportDef> = {
  employees: {
    title: 'Employee list',
    description: 'All employees with department, role and status (filters: departmentId, status, country)',
    permissions: ['report:view', 'employee:view'],
    async build(q) {
      const rows = await prisma.employee.findMany({
        where: { departmentId: q.departmentId, status: q.status, country: q.country },
        include: { department: { select: { name: true } } },
        orderBy: { employeeCode: 'asc' },
      });
      return {
        title: 'Employee list',
        columns: [
          { key: 'code', label: 'ID', width: 10 }, { key: 'name', label: 'Name', width: 22 }, { key: 'department', label: 'Department', width: 20 },
          { key: 'jobTitle', label: 'Job title', width: 22 }, { key: 'country', label: 'Country', width: 8 }, { key: 'nationality', label: 'Nationality', width: 14 },
          { key: 'status', label: 'Status', width: 10 }, { key: 'hireDate', label: 'Hire date', width: 12 }, { key: 'email', label: 'Email', width: 28 },
        ],
        rows: rows.map((e) => ({
          code: e.employeeCode, name: name(e), department: e.department?.name ?? null, jobTitle: e.jobTitle, country: e.country,
          nationality: e.nationality, status: e.status, hireDate: d(e.hireDate), email: e.email,
        })),
      };
    },
  },

  headcount: {
    title: 'Headcount by department',
    description: 'Active and inactive employees per department',
    permissions: ['report:view'],
    async build() {
      const [groups, depts] = await Promise.all([
        prisma.employee.groupBy({ by: ['departmentId', 'status'], _count: { _all: true } }),
        prisma.department.findMany({ select: { id: true, name: true } }),
      ]);
      const byDept = new Map<string, { active: number; inactive: number }>();
      for (const g of groups) {
        const dept = depts.find((x) => x.id === g.departmentId)?.name ?? 'Unassigned';
        const row = byDept.get(dept) ?? { active: 0, inactive: 0 };
        if (g.status === 'active') row.active += g._count._all; else row.inactive += g._count._all;
        byDept.set(dept, row);
      }
      const rows: Record<string, Cell>[] = [...byDept.entries()].sort().map(([department, c]) => ({ department, active: c.active, inactive: c.inactive, total: c.active + c.inactive }));
      rows.push({
        department: 'TOTAL',
        active: rows.reduce((s, r) => s + Number(r.active), 0),
        inactive: rows.reduce((s, r) => s + Number(r.inactive), 0),
        total: rows.reduce((s, r) => s + Number(r.total), 0),
      });
      return {
        title: 'Headcount by department',
        columns: [{ key: 'department', label: 'Department', width: 26 }, { key: 'active', label: 'Active', numeric: true }, { key: 'inactive', label: 'Inactive', numeric: true }, { key: 'total', label: 'Total', numeric: true }],
        rows,
      };
    },
  },

  turnover: {
    title: 'Turnover',
    description: 'Joiners, leavers and turnover rate per department (filters: from, to)',
    permissions: ['report:view'],
    async build(q) {
      const r = range(q);
      const [emps, deactivations, depts] = await Promise.all([
        prisma.employee.findMany({ select: { id: true, departmentId: true, hireDate: true, status: true } }),
        prisma.auditLog.findMany({ where: { entity: 'Employee', action: 'employee.deactivate' }, orderBy: { createdAt: 'asc' } }),
        prisma.department.findMany({ select: { id: true, name: true } }),
      ]);
      const leftOn = new Map<number, Date>(); // latest deactivation per employee
      for (const l of deactivations) leftOn.set(Number(l.entityId), l.createdAt);

      const employed = (e: (typeof emps)[number], at: Date) =>
        (!e.hireDate || e.hireDate <= at) && !(e.status === 'inactive' && (leftOn.get(e.id) ?? new Date(0)) <= at);

      const groups = new Map<string, typeof emps>();
      for (const e of emps) {
        const dept = depts.find((x) => x.id === e.departmentId)?.name ?? 'Unassigned';
        groups.set(dept, [...(groups.get(dept) ?? []), e]);
      }
      groups.set('ALL DEPARTMENTS', emps);

      const rows = [...groups.entries()].map(([department, list]) => {
        const start = list.filter((e) => employed(e, r.from)).length;
        const end = list.filter((e) => employed(e, r.toEnd)).length;
        const joiners = list.filter((e) => e.hireDate && e.hireDate >= r.from && e.hireDate <= r.toEnd).length;
        const leavers = list.filter((e) => e.status === 'inactive' && leftOn.has(e.id) && leftOn.get(e.id)! >= r.from && leftOn.get(e.id)! <= r.toEnd).length;
        const avg = (start + end) / 2;
        return { department, headcountStart: start, headcountEnd: end, joiners, leavers, turnoverPercent: avg > 0 ? Math.round((leavers / avg) * 1000) / 10 : 0 };
      });
      return {
        title: 'Turnover', subtitle: r.label,
        columns: [
          { key: 'department', label: 'Department', width: 24 }, { key: 'headcountStart', label: 'Start', numeric: true }, { key: 'headcountEnd', label: 'End', numeric: true },
          { key: 'joiners', label: 'Joiners', numeric: true }, { key: 'leavers', label: 'Leavers', numeric: true }, { key: 'turnoverPercent', label: 'Turnover %', numeric: true },
        ],
        rows,
      };
    },
  },

  'leave-requests': {
    title: 'Leave requests',
    description: 'Leave requests in a date range (filters: from, to, status, departmentId)',
    permissions: ['report:view', 'leave:view'],
    async build(q) {
      const r = range(q);
      const rows = await prisma.leaveRequest.findMany({
        where: {
          startDate: { lte: r.toEnd }, endDate: { gte: r.from }, status: q.status,
          employee: q.departmentId ? { departmentId: q.departmentId } : undefined,
        },
        include: { employee: { include: { department: { select: { name: true } } } }, leaveType: { select: { name: true } } },
        orderBy: { startDate: 'asc' },
      });
      return {
        title: 'Leave requests', subtitle: r.label,
        columns: [
          { key: 'id', label: '#', numeric: true }, { key: 'employee', label: 'Employee', width: 22 }, { key: 'department', label: 'Department', width: 18 },
          { key: 'type', label: 'Leave type', width: 18 }, { key: 'start', label: 'From', width: 12 }, { key: 'end', label: 'To', width: 12 },
          { key: 'days', label: 'Days', numeric: true }, { key: 'status', label: 'Status', width: 14 },
        ],
        rows: rows.map((l) => ({
          id: l.id, employee: name(l.employee), department: l.employee.department?.name ?? null, type: l.leaveType.name,
          start: d(l.startDate), end: d(l.endDate), days: l.days, status: l.status,
        })),
      };
    },
  },

  'leave-balances': {
    title: 'Leave balances',
    description: 'Annual and sick leave balances for active employees (filters: year, departmentId)',
    permissions: ['report:view', 'leave:view'],
    async build(q) {
      const year = q.year ?? new Date().getUTCFullYear();
      const emps = await prisma.employee.findMany({ where: { status: 'active', departmentId: q.departmentId }, select: { id: true }, orderBy: { employeeCode: 'asc' } });
      const rows: Record<string, Cell>[] = [];
      for (const e of emps) {
        const b = await balances(e.id, year);
        for (const x of b.balances) {
          if (x.allowance !== 'yearly' || !('remaining' in x)) continue;
          rows.push({ employee: name(b.employee), country: b.employee.country, type: x.name, entitlement: x.entitlement ?? null, used: x.used ?? null, pending: x.pending ?? null, remaining: x.remaining ?? null });
        }
      }
      return {
        title: 'Leave balances', subtitle: String(year),
        columns: [
          { key: 'employee', label: 'Employee', width: 22 }, { key: 'country', label: 'Country', width: 8 }, { key: 'type', label: 'Leave type', width: 16 },
          { key: 'entitlement', label: 'Entitlement', numeric: true }, { key: 'used', label: 'Used', numeric: true },
          { key: 'pending', label: 'Pending', numeric: true }, { key: 'remaining', label: 'Remaining', numeric: true },
        ],
        rows,
      };
    },
  },

  payroll: {
    title: 'Payroll summary',
    description: 'Gross, deductions and net per employee for a month (filters: period required, country = BH or SA)',
    permissions: ['report:view', 'payroll:view'],
    async build(q) {
      if (!q.period) throw new HttpError(400, 'period is required, e.g. ?period=2026-11');
      // one run per entity: both by default, or one with ?country=BH|SA
      const runs = await prisma.payrollRun.findMany({ where: { period: q.period, entity: q.country }, orderBy: { entity: 'asc' } });
      if (runs.length === 0) throw new HttpError(404, `No payroll run for ${q.period}`);
      const slips = await prisma.payslip.findMany({ where: { runId: { in: runs.map((r) => r.id) } }, orderBy: [{ currency: 'asc' }, { employeeCode: 'asc' }] });
      const rows: Record<string, Cell>[] = slips.map((s) => ({
        code: s.employeeCode, name: s.employeeName, department: s.department, currency: s.currency,
        gross: n(s.grossSalary), deductions: n(s.totalDeductions), net: n(s.netSalary),
      }));
      for (const cur of [...new Set(slips.map((s) => s.currency))]) {
        const mine = slips.filter((s) => s.currency === cur);
        const sum = (k: 'grossSalary' | 'totalDeductions' | 'netSalary') => mine.reduce((t, s) => t.plus(s[k]), new Prisma.Decimal(0)).toNumber();
        rows.push({ code: 'TOTAL', name: `${mine.length} employee(s)`, department: null, currency: cur, gross: sum('grossSalary'), deductions: sum('totalDeductions'), net: sum('netSalary') });
      }
      return {
        title: 'Payroll summary', subtitle: `${q.period} (${runs.map((r) => `${r.entity} ${r.status}`).join(', ')})`,
        columns: [
          { key: 'code', label: 'ID', width: 10 }, { key: 'name', label: 'Employee', width: 22 }, { key: 'department', label: 'Department', width: 18 },
          { key: 'currency', label: 'Cur.', width: 6 }, { key: 'gross', label: 'Gross', numeric: true, width: 13 },
          { key: 'deductions', label: 'Deductions', numeric: true, width: 13 }, { key: 'net', label: 'Net', numeric: true, width: 13 },
        ],
        rows,
      };
    },
  },

  'allowances-deductions': {
    title: 'Allowances and deductions',
    description: 'Approved and pending entries active in a month (filters: period, status)',
    permissions: ['report:view', 'payroll:view'],
    async build(q) {
      const period = q.period ?? new Date().toISOString().slice(0, 7);
      const items = await prisma.payItem.findMany({
        where: { status: q.status, fromPeriod: { lte: period }, OR: [{ recurring: true, toPeriod: null }, { toPeriod: { gte: period } }] },
        include: { employee: true, type: true },
        orderBy: [{ employeeId: 'asc' }, { id: 'asc' }],
      });
      return {
        title: 'Allowances and deductions', subtitle: period,
        columns: [
          { key: 'employee', label: 'Employee', width: 22 }, { key: 'type', label: 'Type', width: 20 }, { key: 'kind', label: 'Kind', width: 10 },
          { key: 'amount', label: 'Amount', numeric: true }, { key: 'recurring', label: 'Recurring', width: 10 }, { key: 'status', label: 'Status', width: 10 },
          { key: 'reason', label: 'Reason', width: 28 },
        ],
        rows: items.map((i) => ({
          employee: name(i.employee), type: i.type.name, kind: i.type.kind, amount: n(i.amount),
          recurring: i.recurring ? `yes (${i.fromPeriod}${i.toPeriod ? ` to ${i.toPeriod}` : '+'})` : 'no', status: i.status, reason: i.reason,
        })),
      };
    },
  },

  'contract-expiry': {
    title: 'Contract expiry',
    description: 'Active contracts ending within N days (filter: days, default 60)',
    permissions: ['report:view', 'contract:view'],
    async build(q) {
      const until = todayUtc();
      until.setUTCDate(until.getUTCDate() + q.days);
      const rows = await prisma.contract.findMany({
        where: { status: 'active', endDate: { not: null, lte: until } },
        include: { employee: true },
        orderBy: { endDate: 'asc' },
      });
      return {
        title: 'Contract expiry', subtitle: `Ending within ${q.days} days`,
        columns: [
          { key: 'number', label: 'Contract', width: 14 }, { key: 'employee', label: 'Employee', width: 22 }, { key: 'type', label: 'Type', width: 10 },
          { key: 'endDate', label: 'End date', width: 12 }, { key: 'daysLeft', label: 'Days left', numeric: true },
        ],
        rows: rows.map((c) => ({ number: c.contractNumber ?? `CT-${c.id}`, employee: name(c.employee), type: c.contractType, endDate: d(c.endDate), daysLeft: daysLeft(c.endDate!) })),
      };
    },
  },

  'document-expiry': {
    title: 'Document expiry',
    description: 'Documents (CPR, passport, visa...) expiring within N days (filter: days, default 60)',
    permissions: ['report:view', 'document:view'],
    async build(q) {
      const until = todayUtc();
      until.setUTCDate(until.getUTCDate() + q.days);
      const rows = await prisma.document.findMany({
        where: { deletedAt: null, expiryDate: { not: null, lte: until } },
        include: { employee: true },
        orderBy: { expiryDate: 'asc' },
      });
      return {
        title: 'Document expiry', subtitle: `Expiring within ${q.days} days`,
        columns: [
          { key: 'employee', label: 'Employee', width: 22 }, { key: 'title', label: 'Document', width: 24 }, { key: 'category', label: 'Category', width: 14 },
          { key: 'expiryDate', label: 'Expiry', width: 12 }, { key: 'daysLeft', label: 'Days left', numeric: true },
        ],
        rows: rows.map((x) => ({ employee: name(x.employee), title: x.title, category: x.category, expiryDate: d(x.expiryDate), daysLeft: daysLeft(x.expiryDate!) })),
      };
    },
  },

  requests: {
    title: 'Employee requests',
    description: 'HR requests and certificates (filters: from, to, status)',
    permissions: ['report:view', 'request:view'],
    async build(q) {
      const r = range(q);
      const rows = await prisma.employeeRequest.findMany({
        where: { createdAt: { gte: r.from, lte: r.toEnd }, status: q.status },
        include: { employee: true, type: true },
        orderBy: { createdAt: 'asc' },
      });
      return {
        title: 'Employee requests', subtitle: r.label,
        columns: [
          { key: 'ref', label: 'Ref', width: 12 }, { key: 'employee', label: 'Employee', width: 22 }, { key: 'type', label: 'Type', width: 22 },
          { key: 'purpose', label: 'Purpose', width: 26 }, { key: 'status', label: 'Status', width: 12 },
          { key: 'created', label: 'Submitted', width: 12 }, { key: 'completed', label: 'Completed', width: 12 },
        ],
        rows: rows.map((x) => ({
          ref: `REQ-${String(x.id).padStart(5, '0')}`, employee: name(x.employee), type: x.type.name, purpose: x.purpose,
          status: x.status, created: d(x.createdAt), completed: d(x.completedAt),
        })),
      };
    },
  },
};
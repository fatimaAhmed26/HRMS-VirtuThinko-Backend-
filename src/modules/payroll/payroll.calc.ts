import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { countDays, monthsOfService, toDateKey, type Tier } from '../leave/leave.rules';
import { contributionBase, D, dailyRate, periodRange, prorationFactor, round, socialInsurance } from './payroll.rules';

export interface LineItem {
  code: string;
  name: string;
  amount: string;
  source: 'contract' | 'manual' | 'automatic' | 'statutory';
  note?: string;
  rate?: number;
}

export type CalcResult =
  | { ok: true; payslip: Omit<Prisma.PayslipUncheckedCreateInput, 'runId'>; warnings: string[] }
  | { ok: false; reason: string };

const sum = (items: LineItem[]) => items.reduce((s, i) => s.plus(i.amount), D(0));

export async function calculatePayslip(employeeId: number, period: string): Promise<CalcResult> {
  const { start, end } = periodRange(period);
  const warnings: string[] = [];

  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true, employeeCode: true, firstName: true, lastName: true, jobTitle: true, country: true,
      isNational: true, siNewScheme: true, hireDate: true, department: { select: { name: true } },
    },
  });
  if (!emp) return { ok: false, reason: 'Employee not found' };

  // salary comes from the single active contract 
  const contract = await prisma.contract.findFirst({
    where: { employeeId, status: 'active', startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] },
    orderBy: { startDate: 'desc' },
  });
  if (!contract) return { ok: false, reason: 'No active contract covering this period' };

  const factor = prorationFactor(emp.hireDate, period);
  if (factor.isZero()) return { ok: false, reason: 'Hire date is after this period' };
  if (factor.lessThan(1)) warnings.push(`Joined during the period - paid ${factor.times(30).toFixed(0)}/30 days`);

  const c = emp.country;
  const money = (v: Prisma.Decimal) => round(v, c).toFixed();

  //earnings from the contract
  const basic = round(contract.basicSalary.times(factor), c);
  const earnings: LineItem[] = [{ code: 'BASIC', name: 'Basic salary', amount: basic.toFixed(), source: 'contract' }];
  if (!contract.housingAllowance.isZero()) {
    earnings.push({ code: 'HOUSING', name: 'Housing allowance', amount: money(contract.housingAllowance.times(factor)), source: 'contract' });
  }
  if (!contract.transportAllowance.isZero()) {
    earnings.push({ code: 'TRANSPORT', name: 'Transportation allowance', amount: money(contract.transportAllowance.times(factor)), source: 'contract' });
  }

  // approved recurring / one-time items for this period
  const items = await prisma.payItem.findMany({
    where: {
      employeeId, status: 'approved', fromPeriod: { lte: period },
      OR: [{ recurring: true, toPeriod: null }, { toPeriod: { gte: period } }],
    },
    include: { type: true },
    orderBy: { id: 'asc' },
  });
  const deductions: LineItem[] = [];
  let contributoryExtra = D(0);
  for (const it of items) {
    const line: LineItem = { code: it.type.code, name: it.type.name, amount: money(it.amount), source: 'manual', note: it.reason ?? undefined };
    if (it.type.kind === 'earning') {
      earnings.push(line);
      if (it.type.contributory) contributoryExtra = contributoryExtra.plus(it.amount);
    } else {
      deductions.push(line);
    }
  }

  // ── leave: automatic deduction only for unpaid leave (BR-4.5); partly-paid leave is flagged for HR (BR-4.3)
  const leaves = await prisma.leaveRequest.findMany({
    where: { employeeId, status: 'approved', startDate: { lte: end }, endDate: { gte: start } },
    include: { leaveType: true },
  });
  if (leaves.length > 0) {
    const holidays = new Set(
      (await prisma.publicHoliday.findMany({ where: { country: c, date: { gte: start, lte: end } } })).map((h) => toDateKey(h.date))
    );
    for (const l of leaves) {
      const from = l.startDate > start ? l.startDate : start;
      const to = l.endDate < end ? l.endDate : end;
      const daysThisMonth = countDays(from, to, l.leaveType.countWorkingDays, holidays);
      if (l.leaveType.code === 'UNPAID') {
        deductions.push({
          code: 'UNPAID_LEAVE', name: 'Unpaid leave', source: 'automatic',
          amount: money(dailyRate(contract.basicSalary).times(daysThisMonth)),
          note: `${daysThisMonth} day(s) x basic/30 (leave #${l.id})`,
        });
      } else {
        const tiers = (Array.isArray(l.payBreakdown) ? l.payBreakdown : []) as unknown as Tier[];
        if (tiers.some((t) => t.payPercent < 100)) {
          warnings.push(`${l.leaveType.name} #${l.id} has partly-paid or unpaid days - review and add a manual deduction (BR-4.3)`);
        }
      }
    }
  }

  const housing = earnings.find((e) => e.code === 'HOUSING')?.amount ?? '0';
  const base = contributionBase(c, basic.plus(housing).plus(contributoryExtra));
  const years = emp.hireDate ? monthsOfService(emp.hireDate, end) / 12 : 0;
  const si = socialInsurance({ country: c, isNational: emp.isNational, siNewScheme: emp.siNewScheme, yearsOfService: years }, period);
  for (const r of si.employee) {
    deductions.push({ code: r.code, name: r.name, amount: money(base.times(r.rate).div(100)), source: 'statutory', rate: r.rate });
  }
  const employerContributions: LineItem[] = si.employer.map((r) => ({
    code: r.code, name: r.name, amount: money(base.times(r.rate).div(100)), source: 'statutory', rate: r.rate,
  }));

  const gross = sum(earnings);
  const totalDeductions = sum(deductions);
  const net = gross.minus(totalDeductions);
  if (net.isNegative()) warnings.push('Deductions exceed gross salary - net pay is negative');

  return {
    ok: true,
    warnings,
    payslip: {
      employeeId: emp.id,
      contractId: contract.id,
      employeeCode: emp.employeeCode,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      department: emp.department?.name ?? null,
      jobTitle: emp.jobTitle,
      country: c,
      currency: contract.currency,
      basicSalary: basic,
      earnings: earnings as unknown as Prisma.InputJsonValue,
      deductions: deductions as unknown as Prisma.InputJsonValue,
      employerContributions: employerContributions as unknown as Prisma.InputJsonValue,
      grossSalary: round(gross, c),
      totalDeductions: round(totalDeductions, c),
      netSalary: round(net, c),
    },
  };
}
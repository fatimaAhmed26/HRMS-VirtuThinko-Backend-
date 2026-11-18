// Payroll sheet for one run, laid out like the Bahrain payroll sheet:
// employee details, salary & allowances, additions, gross, deductions, net.
// Columns are filled from the payslip lines by code (see EARNING_COLUMN and deductionColumn).
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { getCompany } from '../../utils/settings';
import { CURRENCY, D, periodLabel, prorationFactor, round } from './payroll.rules';

export interface SheetColumn { key: string; label: string; group: 'salary' | 'addition' | 'total' | 'deduction' }

export const SHEET_COLUMNS: SheetColumn[] = [
  { key: 'basic', label: 'Basic salary', group: 'salary' },
  { key: 'phone', label: 'Phone allowance', group: 'salary' },
  { key: 'accommodation', label: 'Accommodation allowance', group: 'salary' },
  { key: 'transport', label: 'Transport allowance', group: 'salary' },
  { key: 'otherAllowances', label: 'Other allowances', group: 'salary' },
  { key: 'reimbursement', label: 'Reimbursement', group: 'addition' },
  { key: 'incentive', label: 'Incentive', group: 'addition' },
  { key: 'overtime', label: 'Overtime', group: 'addition' },
  { key: 'otherAdditions', label: 'Other additions', group: 'addition' },
  { key: 'gross', label: 'Gross', group: 'total' },
  { key: 'sio', label: 'SIO', group: 'deduction' },
  { key: 'loans', label: 'Loans', group: 'deduction' },
  { key: 'leave', label: 'Leave', group: 'deduction' },
  { key: 'otherDeductions', label: 'Other deductions', group: 'deduction' },
  { key: 'net', label: 'Net pay', group: 'total' },
];

// payslip earning code -> sheet column (anything else: contract allowances go to "other allowances", pay items to "other additions")
const EARNING_COLUMN: Record<string, string> = {
  BASIC: 'basic',
  STIPEND: 'basic',
  PHONE_ALLOWANCE: 'phone',
  HOUSING: 'accommodation',
  TRANSPORT: 'transport',
  REIMBURSEMENT: 'reimbursement',
  INCENTIVE: 'incentive',
  OVERTIME: 'overtime',
};

function earningColumn(line: { code: string; source: string }) {
  return EARNING_COLUMN[line.code] ?? (line.source === 'contract' ? 'otherAllowances' : 'otherAdditions');
}

function deductionColumn(code: string) {
  if (code.startsWith('SIO_') || code.startsWith('GOSI_')) return 'sio';
  if (code.startsWith('LOAN')) return 'loans';
  if (code === 'UNPAID_LEAVE' || code.startsWith('LEAVE')) return 'leave';
  return 'otherDeductions';
}

interface Line { code: string; name: string; amount: string; source: string }

export async function runSheet(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw new HttpError(404, 'Payroll run not found');

  const payslips = await prisma.payslip.findMany({ where: { runId: id }, orderBy: { employeeCode: 'asc' } });
  const employees = await prisma.employee.findMany({
    where: { id: { in: payslips.map((p) => p.employeeId) } },
    select: { id: true, hireDate: true, clientCompany: { select: { name: true } } },
  });
  const byId = new Map(employees.map((e) => [e.id, e]));

  const decimals = CURRENCY[run.entity]?.decimals ?? 2;
  const format = (v: Prisma.Decimal) => round(v, run.entity).toFixed(decimals);
  const zeros = () => Object.fromEntries(SHEET_COLUMNS.map((c) => [c.key, D(0)])) as Record<string, Prisma.Decimal>;
  const totals = zeros();

  const rows = payslips.map((p, i) => {
    const emp = byId.get(p.employeeId);
    const amounts = zeros();
    for (const l of p.earnings as unknown as Line[]) amounts[earningColumn(l)] = amounts[earningColumn(l)].plus(l.amount);
    for (const l of p.deductions as unknown as Line[]) {
      const col = deductionColumn(l.code);
      amounts[col] = amounts[col].plus(l.amount);
    }
    amounts.gross = D(p.grossSalary);
    amounts.net = D(p.netSalary);
    for (const c of SHEET_COLUMNS) totals[c.key] = totals[c.key].plus(amounts[c.key]);

    return {
      no: i + 1,
      employeeCode: p.employeeCode,
      employeeName: p.employeeName,
      workingDays: Math.round(prorationFactor(emp?.hireDate ?? null, run.period).times(30).toNumber()),
      client: emp?.clientCompany?.name ?? 'VirtuThinko (Internal)',
      jobTitle: p.jobTitle ?? '-',
      amounts: Object.fromEntries(SHEET_COLUMNS.map((c) => [c.key, format(amounts[c.key])])),
    };
  });

  return {
    id: run.id,
    period: run.period,
    periodLabel: periodLabel(run.period),
    entity: run.entity,
    currency: CURRENCY[run.entity]?.code ?? 'BHD',
    columns: SHEET_COLUMNS,
    rows,
    totals: Object.fromEntries(SHEET_COLUMNS.map((c) => [c.key, format(totals[c.key])])),
  };
}

export async function runSheetExcel(id: number) {
  const sheet = await runSheet(id);
  const company = await getCompany();
  const decimals = CURRENCY[sheet.entity]?.decimals ?? 2;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Payroll');
  ws.addRow([`${company.name} | Payroll | ${sheet.periodLabel}`]).font = { bold: true, size: 12 };
  ws.addRow([`All amounts in ${sheet.currency}`]);
  ws.addRow([]);

  const headers = ['No.', 'Employee name', 'Working days', 'Client', 'Job title', ...sheet.columns.map((c) => c.label)];
  const header = ws.addRow(headers);
  header.font = { bold: true };
  header.alignment = { wrapText: true, vertical: 'middle' };

  for (const r of sheet.rows) {
    ws.addRow([r.no, r.employeeName, r.workingDays, r.client, r.jobTitle, ...sheet.columns.map((c) => Number(r.amounts[c.key]))]);
  }
  const total = ws.addRow(['', 'Total', '', '', '', ...sheet.columns.map((c) => Number(sheet.totals[c.key]))]);
  total.font = { bold: true };

  // amount columns use the currency's decimals (BHD 3, SAR 2)
  const amountFormat = `#,##0.${'0'.repeat(decimals)}`;
  const firstAmount = 6;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 4) return;
    for (let col = firstAmount; col < firstAmount + sheet.columns.length; col++) row.getCell(col).numFmt = amountFormat;
  });
  ws.getColumn(2).width = 28;
  ws.getColumn(4).width = 24;
  ws.getColumn(5).width = 26;

  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    fileName: `payroll-${sheet.period}-${sheet.entity}.xlsx`,
  };
}

// English employment contract (unlimited or limited) on the company letterhead.
// DRAFT: the clause wording is a standard template and must be reviewed by legal counsel before it is used with employees.
import { Prisma } from '@prisma/client';
import { pdfToBuffer } from '../../utils/pdf';
import { FONT, FONT_BOLD, LETTER_LEFT, LETTER_RIGHT, letterDate, useLetterhead } from '../../utils/letterhead';
import type { CompanyInfo } from '../../utils/settings';
import type { ContractTerms, SalaryItem } from './contract.schema';

const A4_WIDTH = 595.28;
const WIDTH = LETTER_RIGHT - LETTER_LEFT;
const TOP = 130;     // below the red header band
const BOTTOM = 100;  // above the footer strip
const COL = { label: LETTER_LEFT, type: LETTER_LEFT + 230, paid: LETTER_LEFT + 320 };
const AMOUNT_WIDTH = 110;

export interface ContractPdfInput {
  contract: {
    id: number;
    contractNumber: string | null;
    title: string | null;
    contractType: string;
    jobTitle: string | null;
    weeklyHours: number | null;
    startDate: Date;
    endDate: Date | null;
    basicSalary: Prisma.Decimal;
    housingAllowance: Prisma.Decimal;
    transportAllowance: Prisma.Decimal;
    currency: string;
    employee: { firstName: string; lastName: string; employeeCode: string };
  };
  terms: ContractTerms;
  employee: { fullNamePassport: string | null; nationality: string | null; cprNumber: string | null };
  company: CompanyInfo;
  signatory: { name: string; title: string };
}

const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const sum = (xs: Prisma.Decimal[]) => xs.reduce((a, b) => a.plus(b), D(0));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// BHD has 3 decimals (fils), SAR has 2 (halalas); thousands separators as on the payslips
function money(v: Prisma.Decimal | number | string, currency: string) {
  const [int, frac] = D(v).toFixed(currency === 'SAR' ? 2 : 3).split('.');
  return `${currency} ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac ? `.${frac}` : ''}`;
}

export function contractPdf(input: ContractPdfInput): Promise<Buffer> {
  const { contract: c, terms, employee: e, company, signatory } = input;
  const cur = c.currency;
  const items: SalaryItem[] = terms.items ?? [];
  const pick = (kind: SalaryItem['kind'], paid: SalaryItem['paid']) => items.filter((i) => i.kind === kind && i.paid === paid);
  const itemSum = (list: SalaryItem[]) => sum(list.map((i) => D(i.amount)));

  const monthlyEarnings = sum([D(c.basicSalary), D(c.housingAllowance), D(c.transportAllowance), itemSum(pick('allowance', 'monthly'))]);
  const monthlyDeductions = itemSum(pick('deduction', 'monthly'));
  const netBeforeSocialInsurance = monthlyEarnings.minus(monthlyDeductions);
  const yearlyBonuses = itemSum(pick('bonus', 'yearly')).plus(itemSum(pick('allowance', 'yearly')));
  const yearlyDeductions = itemSum(pick('deduction', 'yearly'));
  const totalAnnual = monthlyEarnings.times(12).plus(yearlyBonuses).minus(yearlyDeductions);

  const employeeName = e.fullNamePassport || `${c.employee.firstName} ${c.employee.lastName}`;
  const number = c.contractNumber ?? `CT-${c.id}`;
  const unlimited = c.contractType === 'unlimited';
  const start = letterDate(c.startDate);
  const end = c.endDate ? letterDate(c.endDate) : '';
  const weeklyHours = c.weeklyHours ?? 40;

  const clauses: { title: string; body: string }[] = [
    {
      title: 'Duration',
      body: unlimited
        ? `This contract starts on ${start} and is of unlimited duration.`
        : `This contract starts on ${start} and ends on ${end}. It may be renewed only by a new written contract signed by both parties.`,
    },
    { title: 'Position and duties', body: `The Employee is employed as ${c.jobTitle ?? 'the position agreed with HR'}. The Employee shall perform the duties of this position and other reasonable duties that the Employer assigns.` },
    { title: 'Working hours', body: `The Employee shall work ${weeklyHours} hours per week, in line with the Employer's working hours and policies.` },
    { title: 'Remuneration', body: 'The Employee\'s remuneration is set out in the Schedule of Remuneration below. Salary and monthly allowances are paid monthly. Bonuses are paid yearly or on the Employer\'s approval and are not part of the monthly salary.' },
    { title: 'Social insurance', body: 'Social insurance (SIO) contributions are deducted and paid as required by Bahraini law, calculated under the Employer\'s payroll rules.' },
    { title: 'Probation', body: terms.probationMonths > 0 ? `The first ${terms.probationMonths} months of employment are a probation period.` : 'No probation period applies.' },
    { title: 'Annual leave', body: `The Employee is entitled to ${terms.annualLeaveDays} working days of paid annual leave each year, in line with the Employer's leave policy.` },
    { title: 'Notice', body: `After the probation period, either party may end this contract by giving ${terms.noticeDays} days' written notice, unless the law requires otherwise.` },
    { title: 'Confidentiality', body: 'The Employee shall keep confidential the Employer\'s non-public information, including client information and remuneration details, during and after employment.' },
    { title: 'Governing law', body: 'This contract is governed by the laws of the Kingdom of Bahrain, including the Labour Law for the Private Sector (Legislative Decree No. 36 of 2012). Disputes shall be referred to the competent courts of the Kingdom of Bahrain.' },
  ];

  const schedule: { label: string; type: string; paid: string; amount: string }[] = [
    { label: 'Basic salary', type: 'Earning', paid: 'Monthly', amount: money(c.basicSalary, cur) },
    ...(D(c.housingAllowance).gt(0) ? [{ label: 'Housing allowance', type: 'Allowance', paid: 'Monthly', amount: money(c.housingAllowance, cur) }] : []),
    ...(D(c.transportAllowance).gt(0) ? [{ label: 'Transport allowance', type: 'Allowance', paid: 'Monthly', amount: money(c.transportAllowance, cur) }] : []),
    ...items.map((i) => ({ label: i.label, type: cap(i.kind), paid: cap(i.paid), amount: money(i.amount, cur) })),
    { label: 'Social insurance (SIO), employee share', type: 'Deduction', paid: 'Monthly', amount: 'As per payroll rules' },
  ];

  return pdfToBuffer((doc) => {
    useLetterhead(doc); // red header band and footer on every page

    // ── helpers: page room, paragraphs, table rows ──
    const ensureRoom = (h: number) => { if (doc.y + h > doc.page.height - BOTTOM) doc.addPage(); };
    const para = (text: string, opts: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'justify' } = {}) => {
      doc.font(opts.bold ? FONT_BOLD : FONT).fontSize(opts.size ?? 9.5);
      const h = doc.heightOfString(text, { width: WIDTH, align: opts.align ?? 'justify' });
      ensureRoom(h);
      doc.text(text, LETTER_LEFT, doc.y, { width: WIDTH, align: opts.align ?? 'justify' });
      doc.moveDown(0.5);
    };
    const tableRow = (cells: [string, string, string, string], bold = false) => {
      const widths = [COL.type - COL.label - 8, COL.paid - COL.type - 8, 80, AMOUNT_WIDTH];
      doc.font(bold ? FONT_BOLD : FONT).fontSize(9);
      const h = Math.max(...cells.map((t, i) => doc.heightOfString(t, { width: widths[i] }))) + 6;
      ensureRoom(h);
      const y = doc.y;
      doc.text(cells[0], COL.label, y, { width: widths[0] });
      doc.text(cells[1], COL.type, y, { width: widths[1] });
      doc.text(cells[2], COL.paid, y, { width: widths[2] });
      doc.text(cells[3], LETTER_RIGHT - AMOUNT_WIDTH, y, { width: AMOUNT_WIDTH, align: 'right' });
      doc.moveTo(LETTER_LEFT, y + h - 2).lineTo(LETTER_RIGHT, y + h - 2).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
      doc.y = y + h;
    };

    // ── title and parties ──
    doc.font(FONT_BOLD).fontSize(14).text('EMPLOYMENT CONTRACT', LETTER_LEFT, doc.y, { width: WIDTH, align: 'center' });
    doc.font(FONT).fontSize(10).text(c.title ?? 'Employment Contract', LETTER_LEFT, doc.y, { width: WIDTH, align: 'center' });
    doc.fontSize(9).text(`Contract no. ${number}    Date: ${letterDate(new Date())}`, LETTER_LEFT, doc.y, { width: WIDTH, align: 'center' });
    doc.moveDown(1);

    para('This contract is made between:', { bold: true });
    para(`(1) ${terms.employingEntity}${company.address ? `, ${company.address}` : ''} (the "Employer"); and`);
    const idParts = [e.nationality && `nationality ${e.nationality}`, e.cprNumber && `CPR ${e.cprNumber}`, `employee number ${c.employee.employeeCode}`].filter(Boolean);
    para(`(2) ${employeeName}, ${idParts.join(', ')} (the "Employee").`);

    // ── clauses ──
    clauses.forEach((cl, i) => {
      doc.moveDown(0.2);
      para(`${i + 1}. ${cl.title}`, { bold: true, align: 'left' });
      para(cl.body);
    });

    // ── schedule of remuneration ──
    doc.moveDown(0.4);
    ensureRoom(18 * (schedule.length + 6) + 30); // keep the schedule on one page
    para('Schedule of Remuneration (monthly, unless stated)', { bold: true, align: 'left', size: 10 });
    tableRow(['Component', 'Type', 'Paid', 'Amount'], true);
    schedule.forEach((r) => tableRow([r.label, r.type, r.paid, r.amount]));
    doc.moveDown(0.6);
    const summary: [string, string][] = [
      ['Gross monthly salary', money(monthlyEarnings, cur)],
      ['Net monthly pay (before social insurance)', money(netBeforeSocialInsurance, cur)],
      ['Yearly bonuses', money(yearlyBonuses, cur)],
      ['Total annual package', money(totalAnnual, cur)],
    ];
    summary.forEach(([label, value], i) => tableRow([label, '', '', value], i === 3));
    doc.moveDown(0.4);
    para('Monthly deductions other than social insurance are shown in the schedule. Social insurance is calculated under the payroll rules. The total annual package is twelve months of gross salary plus yearly bonuses.', { size: 8.5 });

    // ── signatures (printed copies are signed by hand; electronic signing uses the secure link) ──
    ensureRoom(150);
    doc.moveDown(0.8);
    para('Signatures', { bold: true, align: 'left' });
    const sigY = doc.y + 6;
    const colW = WIDTH / 2 - 10;
    doc.font(FONT_BOLD).fontSize(9.5).text('For the Employer', LETTER_LEFT, sigY, { width: colW });
    doc.font(FONT).fontSize(9.5).text(`Name: ${signatory.name}`, LETTER_LEFT, doc.y + 4, { width: colW });
    doc.text(`Title: ${signatory.title}`, LETTER_LEFT, doc.y + 2, { width: colW });
    doc.text('Signature: ______________________', LETTER_LEFT, doc.y + 18, { width: colW });
    doc.font(FONT_BOLD).fontSize(9.5).text('The Employee', LETTER_LEFT + WIDTH / 2 + 10, sigY, { width: colW });
    doc.font(FONT).fontSize(9.5).text(`Name: ${employeeName}`, LETTER_LEFT + WIDTH / 2 + 10, doc.y + 4, { width: colW });
    doc.text('Signature: ______________________', LETTER_LEFT + WIDTH / 2 + 10, doc.y + 18, { width: colW });
    doc.text('Date: ______________________', LETTER_LEFT + WIDTH / 2 + 10, doc.y + 6, { width: colW });
    doc.moveDown(2);
    doc.font(FONT).fontSize(8).fillColor('#6B7280').text('The Employee may also sign this contract electronically through the secure link sent by HR.', LETTER_LEFT, doc.y, { width: WIDTH, align: 'left' });
    doc.fillColor('#000000');
  }, { margins: { top: TOP, bottom: BOTTOM, left: LETTER_LEFT, right: A4_WIDTH - LETTER_RIGHT } });
}

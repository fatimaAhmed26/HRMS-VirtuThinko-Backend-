// Payslip PDF (requirements section 13: company & employee details, month, earnings, deductions, gross, net)
// on the company letterhead, in the same style as the company letters (Carlito, thin bordered tables).
import PDFDocument from 'pdfkit';
import type { Writable } from 'stream';
import { periodLabel } from './payroll.rules';
import { BRAND } from '../../utils/pdf';
import { FONT, FONT_BOLD, LETTER_LEFT as LEFT, LETTER_RIGHT as RIGHT, letterDate, useLetterhead } from '../../utils/letterhead';
import type { CompanyInfo } from '../../utils/settings';

interface Line { name: string; amount: string; note?: string; rate?: number }

export interface PayslipPdfData {
  company: CompanyInfo;
  period: string;
  employeeCode: string;
  employeeName: string;
  department: string | null;
  jobTitle: string | null;
  currency: string;
  earnings: Line[];
  deductions: Line[];
  grossSalary: string;
  totalDeductions: string;
  netSalary: string;
  generatedAt: Date;
}

const WIDTH = RIGHT - LEFT;
const SMALL = 11.04;
const ROW = 15.5;
const MUTED = '#555555';

export function writePayslipPdf(data: PayslipPdfData, out: Writable) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Payslip ${data.period} ${data.employeeCode}` } });
  doc.pipe(out);
  useLetterhead(doc);
  doc.lineWidth(0.5).strokeColor('#000000').fillColor('#000000');

  const amount = (v: string) => Number(v).toLocaleString('en-US', { minimumFractionDigits: data.currency === 'BHD' ? 3 : 2, maximumFractionDigits: data.currency === 'BHD' ? 3 : 2 });
  const hline = (y: number) => doc.moveTo(LEFT, y).lineTo(RIGHT, y).stroke();
  const vlines = (y: number, h: number, xs: number[]) => xs.forEach((x) => doc.moveTo(x, y).lineTo(x, y + h).stroke());

  doc.font(FONT).fontSize(SMALL).text(`Date: ${letterDate(data.generatedAt)}`, LEFT, 86.2);
  doc.font(FONT_BOLD).fontSize(12).text(`Subject: Payslip for ${periodLabel(data.period)}`, LEFT, 126, { width: WIDTH, align: 'center' });

  // employee details: two label/value pairs per row
  let y = 160;
  const MID = LEFT + WIDTH / 2;
  const pairs: [string, string][][] = [
    [['Employee:', data.employeeName], ['Employee ID:', data.employeeCode]],
    [['Department:', data.department ?? '-'], ['Job title:', data.jobTitle ?? '-']],
  ];
  hline(y);
  for (const row of pairs) {
    row.forEach(([label, value], i) => {
      const x = i === 0 ? LEFT : MID;
      doc.font(FONT).fontSize(SMALL).text(label, x + 5.7, y + 2, { lineBreak: false });
      doc.font(FONT_BOLD).text(value, x + 75, y + 2, { width: WIDTH / 2 - 80, lineBreak: false, ellipsis: true });
    });
    vlines(y, ROW, [LEFT, LEFT + 70, MID, MID + 70, RIGHT]);
    y += ROW;
    hline(y);
  }
  y += 22;

  // earnings / deductions: line items with the amount right-aligned, then the total in bold
  const AMT = RIGHT - 110;
  const table = (title: string, rows: Line[], total: string, totalLabel: string) => {
    doc.rect(LEFT, y, WIDTH, ROW).fill('#F2F2F2').fillColor('#000000');
    hline(y);
    doc.font(FONT_BOLD).fontSize(SMALL).text(title, LEFT + 5.7, y + 2, { lineBreak: false });
    doc.text(data.currency, AMT, y + 2, { width: RIGHT - AMT - 6, align: 'right', lineBreak: false });
    vlines(y, ROW, [LEFT, AMT, RIGHT]);
    y += ROW;
    hline(y);
    const items = rows.length ? rows : [{ name: 'None', amount: '' } as Line];
    for (const r of items) {
      const h = r.note ? ROW + 10 : ROW;
      doc.font(FONT).fontSize(SMALL).fillColor('#000000').text(r.rate !== undefined ? `${r.name} (${r.rate}%)` : r.name, LEFT + 5.7, y + 2, { width: AMT - LEFT - 10, lineBreak: false, ellipsis: true });
      if (r.amount) doc.text(amount(r.amount), AMT, y + 2, { width: RIGHT - AMT - 6, align: 'right', lineBreak: false });
      if (r.note) doc.fontSize(8.5).fillColor(MUTED).text(r.note, LEFT + 12, y + 14, { width: AMT - LEFT - 16, lineBreak: false, ellipsis: true }).fillColor('#000000');
      vlines(y, h, [LEFT, AMT, RIGHT]);
      y += h;
      hline(y);
    }
    doc.font(FONT_BOLD).fontSize(SMALL).text(totalLabel, LEFT + 5.7, y + 2, { lineBreak: false });
    doc.text(amount(total), AMT, y + 2, { width: RIGHT - AMT - 6, align: 'right', lineBreak: false });
    vlines(y, ROW, [LEFT, AMT, RIGHT]);
    y += ROW;
    hline(y);
    y += 18;
  };
  table('Earnings', data.earnings, data.grossSalary, 'Gross salary');
  table('Deductions', data.deductions, data.totalDeductions, 'Total deductions');

  // net pay in the brand red
  doc.rect(LEFT, y, WIDTH, 30).fill(BRAND);
  doc.fillColor('#FFFFFF').font(FONT_BOLD).fontSize(12).text('Net pay', LEFT + 8, y + 9, { lineBreak: false });
  doc.fontSize(14).text(`${amount(data.netSalary)} ${data.currency}`, LEFT, y + 7.5, { width: WIDTH - 8, align: 'right', lineBreak: false });
  y += 48;

  doc.font(FONT).fontSize(9).fillColor(MUTED)
    .text('This is a system-generated payslip and does not require a signature. Please keep it confidential.', LEFT, y, { width: WIDTH });

  doc.end();
}

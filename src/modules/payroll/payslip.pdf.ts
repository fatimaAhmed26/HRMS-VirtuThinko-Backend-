import PDFDocument from 'pdfkit';
import type { Writable } from 'stream';
import { periodLabel } from './payroll.rules';

interface Line { name: string; amount: string; note?: string; rate?: number }

export interface PayslipPdfData {
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

const BRAND = '#C00020';   
const INK = '#1F2328';
const MUTED = '#6B7280';
const RULE = '#E5E7EB';

export function writePayslipPdf(data: PayslipPdfData, out: Writable) {
  const company = process.env.COMPANY_NAME || 'Company';
  const address = process.env.COMPANY_ADDRESS || '';
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Payslip ${data.period} ${data.employeeCode}` } });
  doc.pipe(out);

  const left = 50;
  const width = doc.page.width - 100;

  // header band
  doc.rect(0, 0, doc.page.width, 6).fill(BRAND);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(company, left, 40);
  if (address) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(address);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND).text('PAYSLIP', left, 40, { width, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(periodLabel(data.period), left, 58, { width, align: 'right' });

  // employee details
  let y = 100;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(RULE).stroke();
  y += 12;
  const field = (label: string, value: string, x: number, yy: number) => {
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, yy);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(value || '-', x, yy + 11);
  };
  field('Employee', data.employeeName, left, y);
  field('Employee ID', data.employeeCode, left + width * 0.5, y);
  field('Department', data.department ?? '', left, y + 32);
  field('Job title', data.jobTitle ?? '', left + width * 0.5, y + 32);
  y += 72;

  // tables
  const amount = (v: string) => `${Number(v).toLocaleString('en-US', { minimumFractionDigits: data.currency === 'BHD' ? 3 : 2 })}`;
  const table = (title: string, rows: Line[], total: string, totalLabel: string) => {
    doc.rect(left, y, width, 20).fill('#F6F7F9');
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(title, left + 8, y + 6);
    doc.text(data.currency, left, y + 6, { width: width - 8, align: 'right' });
    y += 26;
    doc.font('Helvetica').fontSize(10);
    if (rows.length === 0) {
      doc.fillColor(MUTED).text('None', left + 8, y);
      y += 18;
    }
    for (const r of rows) {
      const label = r.rate !== undefined ? `${r.name} (${r.rate}%)` : r.name;
      doc.fillColor(INK).text(label, left + 8, y, { width: width * 0.7 });
      doc.text(amount(r.amount), left, y, { width: width - 8, align: 'right' });
      y += 16;
      if (r.note) {
        doc.fillColor(MUTED).fontSize(8).text(r.note, left + 16, y - 2, { width: width * 0.7 });
        doc.fontSize(10);
        y += 10;
      }
    }
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor(RULE).stroke();
    y += 6;
    doc.font('Helvetica-Bold').fillColor(INK).text(totalLabel, left + 8, y);
    doc.text(amount(total), left, y, { width: width - 8, align: 'right' });
    y += 28;
  };

  table('Earnings', data.earnings, data.grossSalary, 'Gross salary');
  table('Deductions', data.deductions, data.totalDeductions, 'Total deductions');

  // net pay
  doc.rect(left, y, width, 40).fill(BRAND);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text('NET PAY', left + 12, y + 14);
  doc.fontSize(16).text(`${amount(data.netSalary)} ${data.currency}`, left, y + 11, { width: width - 12, align: 'right' });
  y += 60;

  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text(`Generated ${data.generatedAt.toISOString().slice(0, 10)}. This is a system-generated payslip and does not require a signature.`, left, y, { width });

  doc.end();
}
import ExcelJS from 'exceljs';
import { BRAND, INK, MUTED, RULE, pdfToBuffer } from '../../utils/pdf';
import { FONT, FONT_BOLD, contentBottom, useLetterhead } from '../../utils/letterhead';
import type { CompanyInfo } from '../../utils/settings';
import type { ReportResult } from './report.definitions';

export async function toExcel(r: ReportResult, company: CompanyInfo) {
  const wb = new ExcelJS.Workbook();
  wb.creator = company.name;
  const ws = wb.addWorksheet(r.title.slice(0, 31));
  ws.addRow([`${company.name} - ${r.title}`]).font = { bold: true, size: 14 };
  ws.addRow([r.subtitle ?? '', `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`]).font = { color: { argb: 'FF6B7280' } };
  ws.addRow([]);
  const header = ws.addRow(r.columns.map((c) => c.label));
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BRAND.slice(1) } };
  });
  for (const row of r.rows) {
    const added = ws.addRow(r.columns.map((c) => row[c.key] ?? ''));
    if (String(row[r.columns[0].key]).toUpperCase().startsWith('TOTAL')) added.font = { bold: true };
  }
  r.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width ?? (c.numeric ? 12 : 16);
    if (c.numeric) col.alignment = { horizontal: 'right' };
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: r.columns.length } };
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// PDF export on the company letterhead (landscape). The header and footer repeat on every page.
export function toPdf(r: ReportResult, company: CompanyInfo) {
  return pdfToBuffer((doc) => {
    useLetterhead(doc);
    const left = 40;
    const width = doc.page.width - left * 2;
    const bottom = contentBottom(doc) - 4;
    const totalWidth = r.columns.reduce((s, c) => s + (c.width ?? (c.numeric ? 12 : 16)), 0);
    const widths = r.columns.map((c) => ((c.width ?? (c.numeric ? 12 : 16)) / totalWidth) * width);

    doc.font(FONT_BOLD).fontSize(13).fillColor('#000000').text(r.title, left, 50, { width, align: 'center' });
    if (r.subtitle) doc.font(FONT).fontSize(10).fillColor(MUTED).text(r.subtitle, left, doc.y + 1, { width, align: 'center' });
    let y = doc.y + 12;

    const header = () => {
      doc.rect(left, y, width, 18).fill(BRAND);
      let x = left;
      doc.font(FONT_BOLD).fontSize(9).fillColor('#FFFFFF');
      r.columns.forEach((c, i) => {
        doc.text(c.label, x + 4, y + 4.5, { width: widths[i] - 8, align: c.numeric ? 'right' : 'left', lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      y += 22;
    };
    header();

    if (r.rows.length === 0) doc.font(FONT).fontSize(10).fillColor(MUTED).text('No records match these filters.', left, y + 6);
    r.rows.forEach((row, idx) => {
      if (y > bottom) {
        doc.addPage(); // the letterhead is drawn automatically on the new page
        y = 50;
        header();
      }
      const total = String(row[r.columns[0].key] ?? '').toUpperCase().startsWith('TOTAL');
      if (idx % 2 === 1 && !total) doc.rect(left, y - 3, width, 16).fill('#F4F4F4');
      let x = left;
      doc.font(total ? FONT_BOLD : FONT).fontSize(9).fillColor(INK);
      r.columns.forEach((c, i) => {
        const v = row[c.key];
        const text = v === null || v === undefined ? '' : typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : String(v);
        doc.text(text, x + 4, y, { width: widths[i] - 8, align: c.numeric ? 'right' : 'left', lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      y += 16;
      if (total) doc.moveTo(left, y - 2).lineTo(left + width, y - 2).strokeColor(RULE).stroke();
    });

    // page numbers in the empty space left of the red header band
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font(FONT).fontSize(8).fillColor(MUTED).text(
        `${company.name} · ${r.title} · generated ${new Date().toISOString().slice(0, 10)} · page ${i + 1} of ${range.count}`,
        left, 14, { width: doc.page.width - 480, lineBreak: false, ellipsis: true },
      );
    }
  }, { layout: 'landscape', margin: 0, bufferPages: true });
}

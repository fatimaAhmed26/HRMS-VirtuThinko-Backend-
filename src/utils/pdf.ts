import PDFDocument from 'pdfkit';
import type { CompanyInfo } from './settings';

export const BRAND = '#C00020'; 
export const INK = '#1F2328';
export const MUTED = '#6B7280';
export const RULE = '#E5E7EB';

type Doc = InstanceType<typeof PDFDocument>;

export function drawLetterhead(doc: Doc, company: CompanyInfo, title: string, subtitle?: string) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.rect(0, 0, doc.page.width, 6).fill(BRAND);

  let nameX = left;
  if (company.logoPath) {
    try {
      doc.image(company.logoPath, left, 34, { fit: [44, 44] });
      nameX = left + 54;
    } catch {
      
    }
  }
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(company.name, nameX, 38, { width: width * 0.6 });
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  if (company.address) doc.text(company.address, nameX, doc.y + 1, { width: width * 0.6 });
  if (company.contact) doc.text(company.contact, nameX, doc.y + 1, { width: width * 0.6 });

  doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND).text(title.toUpperCase(), left, 40, { width, align: 'right' });
  if (subtitle) doc.font('Helvetica').fontSize(10).fillColor(INK).text(subtitle, left, 58, { width, align: 'right' });

  const y = Math.max(doc.y, 90) + 12;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(RULE).stroke();
  return y + 14;
}

// Build a PDF in memory 
export function pdfToBuffer(build: (doc: Doc) => void, options: PDFKit.PDFDocumentOptions = {}) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, ...options });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}
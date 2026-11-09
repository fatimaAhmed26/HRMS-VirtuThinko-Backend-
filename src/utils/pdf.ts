import PDFDocument from 'pdfkit';

// Shared PDF helpers. The company letterhead (header, footer, font) is in letterhead.ts.

export const BRAND = '#C00020'; 
export const INK = '#1F2328';
export const MUTED = '#6B7280';
export const RULE = '#E5E7EB';

type Doc = InstanceType<typeof PDFDocument>;

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
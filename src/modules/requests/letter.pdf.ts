// HR letters (salary / employment / experience certificates, salary transfer, NOC) in the same
// structure as the company's Word letters: letterhead, Date, To, centred bold Subject, "Dear ...",
// justified paragraphs, "Label: value" blocks as a bordered two-column table, closing name and title.
// No signature or stamp - letters are signed by hand after printing.
import { pdfToBuffer } from '../../utils/pdf';
import { FONT, FONT_BOLD, LETTER_LEFT as LEFT, LETTER_RIGHT as RIGHT, contentBottom, useLetterhead } from '../../utils/letterhead';
import type { CompanyInfo } from '../../utils/settings';

export interface LetterData {
  company: CompanyInfo;
  title: string;         // "Salary certificate" -> "Subject: Salary Certificate"
  reference: string;     // REQ-00005
  date: string;          // "September 7, 2026"
  addressedTo: string;   // "National Bank of Bahrain" or "To Whom It May Concern"
  body: string;          // filled template: paragraphs separated by a blank line
  signatoryName: string;
  signatoryTitle: string;
}

const WIDTH = RIGHT - LEFT;
const SMALL = 11.04;
const BODY = 12;
const LINE_GAP = -0.25;
const MIN_COL = 184; // table column split, as in the acceptance letter (wider when labels are long)

const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Of|And|The|For|To)\b/g, (m) => m.toLowerCase()).replace(/^./, (m) => m.toUpperCase());
// a paragraph whose every line looks like "Basic salary: 900.000 BHD" becomes a table
const isTable = (para: string) => {
  const lines = para.split('\n').filter((l) => l.trim());
  return lines.length >= 2 && lines.every((l) => /^[^:]{2,40}:\s+\S/.test(l.trim()));
};

export function renderLetterPdf(d: LetterData) {
  return pdfToBuffer((doc) => {
    useLetterhead(doc);
    const bottom = contentBottom(doc);
    const room = (h: number) => {
      if (doc.y + h > bottom) { doc.addPage(); doc.y = 72; }
    };

    doc.fillColor('#000000').font(FONT).fontSize(SMALL);
    doc.text(`Date: ${d.date}`, LEFT, 86.2);
    doc.text(`Ref: ${d.reference}`, LEFT, doc.y + 1);
    doc.text('To: ', LEFT, 114.3, { continued: true }).font(FONT_BOLD).text(d.addressedTo, { width: WIDTH - 20 });

    doc.font(FONT_BOLD).fontSize(BODY).text(`Subject: ${titleCase(d.title)}`, LEFT, Math.max(doc.y + 26, 160), { width: WIDTH, align: 'center' });

    doc.font(FONT).fontSize(BODY).text(
      'Dear Sir/Madam,',
      LEFT, doc.y + 32,
    );

    const paras = d.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    paras.forEach((para, i) => {
      const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
      // an intro line ending with ":" followed by "Label: value" lines -> intro text + table
      const intro = lines.length > 2 && lines[0].endsWith(':') && isTable(lines.slice(1).join('\n')) ? lines.shift()! : null;
      if (intro) {
        room(30);
        doc.font(FONT).fontSize(BODY).text(intro, LEFT, doc.y + (i === 0 ? 2 : 14), { width: WIDTH });
      }
      if (intro || isTable(lines.join('\n'))) {
        let y = doc.y + (intro ? 2 : 14);
        room(lines.length * 14 + 6);
        y = Math.max(y, doc.y);
        doc.font(FONT).fontSize(SMALL);
        const COL = Math.max(MIN_COL, ...lines.map((l) => 77.7 + doc.widthOfString(`${l.split(':')[0].trim()}:`) + 12));
        doc.lineWidth(0.5).strokeColor('#000000').moveTo(LEFT, y).lineTo(RIGHT, y).stroke();
        for (const line of lines) {
          const [label, ...rest] = line.split(':');
          const h = 13.9;
          doc.font(FONT).fontSize(SMALL).text(`${label.trim()}:`, 77.7, y - 0.2, { lineBreak: false });
          doc.text(rest.join(':').trim(), COL + 5.4, y - 0.2, { width: RIGHT - COL - 10, lineBreak: false });
          doc.moveTo(LEFT, y).lineTo(LEFT, y + h).moveTo(COL, y).lineTo(COL, y + h).moveTo(RIGHT, y).lineTo(RIGHT, y + h).stroke();
          y += h;
          doc.moveTo(LEFT, y).lineTo(RIGHT, y).stroke();
        }
        doc.x = LEFT;
        doc.y = y + 4;
        return;
      }
      room(40);
      doc.font(FONT).fontSize(BODY).text(lines.join(' '), LEFT, doc.y + (i === 0 ? 2 : 14), { width: WIDTH, align: 'justify', lineGap: LINE_GAP });
    });

    room(80);
    doc.font(FONT).fontSize(BODY).text('Best wishes,', LEFT, doc.y + 30);
    doc.text(d.signatoryName, LEFT, doc.y + 15);
    if (d.signatoryTitle) doc.text(d.signatoryTitle, LEFT, doc.y + 0.5);
    // (no signature or stamp: the space below is left empty for signing by hand)
  }, { margin: 0, info: { Title: `${d.title} ${d.reference}` } });
}

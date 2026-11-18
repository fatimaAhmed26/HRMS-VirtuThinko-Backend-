// Internship acceptance letter - same layout as VirtuThinko's Word letter (Internship_Acceptance_Letter.pdf),
// on the company letterhead, without the signature and stamp (those are added by hand after printing).
// Positions are in PDF points (A4 = 595 x 842) and were measured from the original letter.
import { pdfToBuffer } from '../../utils/pdf';
import { FONT, FONT_BOLD, LETTER_LEFT, LETTER_RIGHT, useLetterhead } from '../../utils/letterhead';

export interface AcceptanceLetterData {
  date: string;          // "September 7, 2026"
  fullName: string;      // "Fatema Hameed"
  firstName: string;
  cpr: string | null;
  nationality: string | null;
  position: string;      // "Intern"
  department: string;    // "IT"
  startDate: string;     // "13 September 2026"
  endDate: string;
  duration: string;      // "12 Weeks"
  signatoryName: string;
  signatoryTitle: string;
}

const LEFT = LETTER_LEFT;
const RIGHT = LETTER_RIGHT;
const WIDTH = RIGHT - LEFT;
const SMALL = 11.04; // the letter mixes 11.04pt (details) and 12pt (body)
const BODY = 12;
const BODY_LINE_GAP = -0.25; // gives the original's 14.65pt line spacing at 12pt
const UP = 2.6; // PDFKit puts text a little lower than Word for the same position

export function renderAcceptanceLetter(d: AcceptanceLetterData) {
  return pdfToBuffer((doc) => {
    useLetterhead(doc); // red band with the logo top right, contact strip at the bottom

    doc.fillColor('#000000');
    const line = (y: number, parts: [string, boolean][], size: number) => {
      parts.forEach(([text, bold], i) => {
        doc.font(bold ? FONT_BOLD : FONT).fontSize(size);
        if (i === 0) doc.text(text, LEFT, y, { continued: i < parts.length - 1, lineBreak: false });
        else doc.text(text, { continued: i < parts.length - 1, lineBreak: false });
      });
    };

    line(88.8 - UP, [[`Date: ${d.date}`, false]], SMALL);
    line(116.9 - UP, [['To: ', false], [d.fullName, true]], SMALL);
    if (d.cpr) line(147.7 - UP, [['CPR: ', false], [d.cpr, true]], SMALL);
    if (d.nationality) line(163.2 - UP, [[`Nationality: ${d.nationality}`, false]], SMALL);

    doc.font(FONT_BOLD).fontSize(BODY).text('Subject: Internship Acceptance Letter', LEFT, 194.3 - UP, { width: WIDTH, align: 'center' });

    line(239.9 - UP, [['Dear ', false], [d.firstName, true], [',', false]], BODY);

    // opening paragraph, justified, with the department in bold
    doc.font(FONT).fontSize(BODY).text(
      'We are pleased to extend our congratulations and offer you the opportunity to join VirtuThinko as an Intern in the ',
      LEFT, 254.6 - UP, { width: WIDTH, align: 'justify', lineGap: BODY_LINE_GAP, continued: true },
    );
    doc.font(FONT_BOLD).text(`${d.department} Department`, { continued: true });
    doc.font(FONT).text(
      '. After carefully reviewing your application, qualifications, and interview performance, we are confident that you possess the skills and attributes that will contribute to the success of our organization.',
    );

    doc.font(FONT).fontSize(BODY).text('Please find below your internship offer details:', LEFT, 327.8 - UP, { lineBreak: false });

    // details table: two columns, thin black borders (first row is a little taller, as in the original)
    const COL = 184;
    const rows: [string, string, number][] = [
      ['Position:', d.position, 20.3],
      ['Department:', d.department, 13.9],
      ['Start Date:', d.startDate, 13.9],
      ['End Date:', d.endDate, 13.9],
      ['Duration:', d.duration, 13.9],
    ];
    let y = 340.2;
    doc.lineWidth(0.5).strokeColor('#000000');
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).stroke();
    for (const [label, value, h] of rows) {
      doc.font(FONT).fontSize(SMALL).text(label, 77.7, y + 2.4 - UP, { lineBreak: false });
      doc.text(value, 189.4, y + 2.4 - UP, { lineBreak: false });
      doc.moveTo(LEFT, y).lineTo(LEFT, y + h).moveTo(COL, y).lineTo(COL, y + h).moveTo(RIGHT, y).lineTo(RIGHT, y + h).stroke();
      y += h;
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).stroke();
    }

    doc.font(FONT).fontSize(BODY).text(
      'We are excited to have you on board and look forward to working alongside you. We are confident that this internship will be a rewarding experience for you.',
      LEFT, 445.7 - UP, { width: WIDTH, align: 'justify', lineGap: BODY_LINE_GAP },
    );

    doc.text('Best wishes,', LEFT, 504.4 - UP, { lineBreak: false });
    doc.text(d.signatoryName, LEFT, 533.7 - UP, { lineBreak: false });
    doc.text(d.signatoryTitle, LEFT, 548.3 - UP, { lineBreak: false });
    // (no signature or stamp: the space below is left empty for signing by hand)
  }, { margin: 0, info: { Title: `Internship Acceptance Letter - ${d.fullName}` } });
}

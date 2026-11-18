// Proposal acceptance form (Polytechnic template) on the company letterhead; signed by hand after printing
import { pdfToBuffer } from '../../utils/pdf';
import { FONT, FONT_BOLD, LETTER_LEFT, LETTER_RIGHT, useLetterhead } from '../../utils/letterhead';
import { drawSignatureBlock, SIGNATURE_BLOCK_HEIGHT, type SignatureStamp } from '../../utils/signatureBlock';

export interface ProposalFormData {
  date: string;
  studentName: string;
  studentId: string | null;
  academicTutor: string | null;
  mentorName: string | null;
  companyName: string;
  major: string | null;
  projectTitle: string | null;
  projectSummary: string | null;
  signatoryName: string;
  signatoryTitle: string;
  signature?: SignatureStamp; // added on the signed copy only
}

export const MAJORS = ['Database', 'MIS', 'Cyber Security', 'Networking', 'Programming'];

const STATEMENTS = [
  'The proposed title is approved for official use and may be published on the Polytechnic website',
  'The proposed project description accurately describes the scope of the project',
  'The project summary and company logo are approved for the Project Exhibition Booklet',
  'The company will provide the student access to equipment, data and software as required',
  'I wish to be contacted to discuss other potential projects (optional)',
];

const LEFT = LETTER_LEFT;
const RIGHT = LETTER_RIGHT;
const WIDTH = RIGHT - LEFT;
const COL = LEFT + 150;
const PAD = 6;

export function renderProposalForm(d: ProposalFormData) {
  return pdfToBuffer((doc) => {
    useLetterhead(doc);
    doc.fillColor('#000000').strokeColor('#000000').lineWidth(0.5);

    doc.font(FONT).fontSize(11).text(`Date: ${d.date}`, LEFT, 88, { lineBreak: false });
    doc.font(FONT_BOLD).fontSize(14).text('Proposal Acceptance Form', LEFT, 116, { width: WIDTH, align: 'center' });

    let y = 150;
    const row = (label: string, draw: (x: number, top: number, w: number) => number) => {
      const valueW = RIGHT - COL - PAD * 2;
      const h = Math.max(22, draw(COL + PAD, y + PAD, valueW) + PAD * 2);
      doc.font(FONT_BOLD).fontSize(10.5).text(label, LEFT + PAD, y + PAD, { width: COL - LEFT - PAD * 2 });
      doc.rect(LEFT, y, WIDTH, h).stroke();
      doc.moveTo(COL, y).lineTo(COL, y + h).stroke();
      y += h;
    };
    const textRow = (label: string, value: string | null) =>
      row(label, (x, top, w) => {
        doc.font(FONT).fontSize(10.5);
        const v = value || '';
        doc.text(v, x, top, { width: w });
        return doc.heightOfString(v || ' ', { width: w });
      });

    textRow('Student name', d.studentName);
    textRow('Student ID', d.studentId);
    textRow('Academic tutor name', d.academicTutor);
    textRow('Mentor name', d.mentorName);
    textRow('Company name', d.companyName);
    row('Major', (x, top) => {
      doc.font(FONT).fontSize(10.5);
      const options = MAJORS.includes(d.major ?? '') || !d.major ? MAJORS : [...MAJORS, d.major];
      let cx = x;
      let cy = top;
      for (const m of options) {
        const w = doc.widthOfString(m) + 22;
        if (cx + w > RIGHT - PAD) { cx = x; cy += 16; }
        doc.rect(cx, cy + 1.5, 8, 8).stroke();
        if (m === d.major) doc.moveTo(cx + 1.5, cy + 5.5).lineTo(cx + 3.5, cy + 8).lineTo(cx + 7, cy + 2.5).stroke();
        doc.text(m, cx + 12, cy, { lineBreak: false });
        cx += w;
      }
      return cy - top + 12;
    });
    textRow('Proposed title', d.projectTitle);
    textRow('Project summary', d.projectSummary);

    y += 14;
    for (const s of STATEMENTS) {
      doc.font(FONT).fontSize(10.5).text(s, LEFT + PAD, y, { width: WIDTH - 60 });
      const h = doc.heightOfString(s, { width: WIDTH - 60 });
      doc.font(FONT_BOLD).text('Y', RIGHT - 30, y, { lineBreak: false });
      y += h + 6;
      doc.strokeColor('#bbbbbb').moveTo(LEFT, y).lineTo(RIGHT, y).stroke().strokeColor('#000000');
      y += 6;
    }

    const stampY = y + 20; // the intern's block sits between the statements and the signature lines
    y = Math.max(y + 50, 640);
    const half = WIDTH / 2 - 15;
    doc.moveTo(LEFT, y).lineTo(LEFT + half, y).moveTo(RIGHT - half, y).lineTo(RIGHT, y).stroke();
    doc.font(FONT_BOLD).fontSize(10.5).text(d.mentorName || '', LEFT, y + 5, { width: half });
    doc.font(FONT).fontSize(9.5).text('Industry mentor', LEFT, y + 19, { width: half });
    doc.font(FONT_BOLD).fontSize(10.5).text(d.signatoryName, RIGHT - half, y + 5, { width: half });
    doc.font(FONT).fontSize(9.5).text(d.signatoryTitle, RIGHT - half, y + 19, { width: half });
    if (d.signature) {
      if (stampY + SIGNATURE_BLOCK_HEIGHT <= y - 12) drawSignatureBlock(doc, d.signature, LEFT, stampY);
      else { doc.addPage(); drawSignatureBlock(doc, d.signature, LEFT, 130); }
    }
  }, { margin: 0, info: { Title: `Proposal Acceptance Form - ${d.studentName}` } });
}

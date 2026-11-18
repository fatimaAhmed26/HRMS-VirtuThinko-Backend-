// The "accepted by" block drawn on a letter once the intern has signed (see signature.service.ts)
import type PDFDocument from 'pdfkit';
import { FONT, FONT_BOLD } from './letterhead';

type Doc = InstanceType<typeof PDFDocument>;

export interface SignatureStamp {
  image: Buffer;     // the signature drawn on the signing page (PNG)
  signerName: string;
  signedOn: string;  // "18 November 2026"
}

export const SIGNATURE_BLOCK_HEIGHT = 88;

export function drawSignatureBlock(doc: Doc, stamp: SignatureStamp, x: number, y: number) {
  doc.fillColor('#000000');
  doc.font(FONT_BOLD).fontSize(10.5).text('Accepted by the intern', x, y, { lineBreak: false });
  doc.image(stamp.image, x, y + 15, { fit: [160, 40] });
  doc.strokeColor('#000000').lineWidth(0.5).moveTo(x, y + 58).lineTo(x + 200, y + 58).stroke();
  doc.font(FONT).fontSize(10).text(stamp.signerName, x, y + 62, { lineBreak: false });
  doc.font(FONT).fontSize(9).fillColor('#555555').text(`Signed electronically on ${stamp.signedOn}`, x, y + 76, { lineBreak: false });
  doc.fillColor('#000000');
}

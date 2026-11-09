// VirtuThinko company letterhead for every generated PDF (letters, payslips, reports):
// red band with the logo top right, contact strip at the bottom, Carlito font (same metrics as Calibri).
// Sizes come from the company's Word letter; positions adapt to portrait or landscape pages.
import path from 'path';
import type PDFDocument from 'pdfkit';

type Doc = InstanceType<typeof PDFDocument>;

const ASSETS = path.resolve('assets');
const HEADER_BAND = path.join(ASSETS, 'letterhead', 'header-band.png');
const HEADER_LOGO = path.join(ASSETS, 'letterhead', 'header-logo.png');
const FOOTER = path.join(ASSETS, 'letterhead', 'footer.png');

export const FONT = 'Body';
export const FONT_BOLD = 'Body-Bold';

export const LETTER_LEFT = 72;     // text margins of the Word letter
export const LETTER_RIGHT = 523;
const FOOTER_SPACE = 92;    // keep text above the footer strip

function registerFonts(doc: Doc) {
  doc.registerFont(FONT, path.join(ASSETS, 'fonts', 'Carlito-Regular.ttf'));
  doc.registerFont(FONT_BOLD, path.join(ASSETS, 'fonts', 'Carlito-Bold.ttf'));
}

// Draw the header and footer on the current page (does not move the text cursor)
function drawLetterheadArt(doc: Doc) {
  const { x, y } = doc;
  const w = doc.page.width;
  const h = doc.page.height;
  doc.image(HEADER_BAND, w - 451.1, 1.8, { width: 451.1, height: 31.4 });
  doc.image(HEADER_LOGO, w - 213.5, -1.3, { width: 212.6, height: 35.3 });
  doc.image(FOOTER, (w - 530.5) / 2, h - 77.7, { width: 530.5, height: 60.7 });
  doc.x = x;
  doc.y = y;
}

// Fonts + letterhead on the first page and on every page added later
export function useLetterhead(doc: Doc) {
  registerFonts(doc);
  drawLetterheadArt(doc);
  doc.on('pageAdded', () => drawLetterheadArt(doc));
}

// Lowest y text may reach before the footer
export const contentBottom = (doc: Doc) => doc.page.height - FOOTER_SPACE;

// Long dates as in the company letters: "September 7, 2026" and "13 September 2026"
export const letterDate = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Bahrain' }).format(d);
export const longDate = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);

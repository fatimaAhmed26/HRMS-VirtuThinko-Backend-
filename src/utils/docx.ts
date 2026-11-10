// Reads a Word (.docx) file without extra packages: a .docx is a zip of XML files.
// Gives the text (tables kept as "cell | cell" rows, ticked boxes as ☒, empty boxes as ☐)
// and the pictures pasted into it (e.g. a CPR copy or a photo).
import zlib from 'zlib';
import { HttpError } from './httpError';

const MAX_UNZIPPED = 50 * 1024 * 1024; // refuse "zip bombs"

interface ZipEntry { name: string; data: Buffer }

// Minimal zip reader: walks the central directory at the end of the file
function unzip(buf: Buffer, wanted: (name: string) => boolean): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new HttpError(400, 'This Word file is damaged or not a .docx');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new HttpError(400, 'This Word file is damaged');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;

    total += size;
    if (total > MAX_UNZIPPED) throw new HttpError(400, 'This Word file is too large to read');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compSize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw, { maxOutputLength: MAX_UNZIPPED }) : null;
    if (data) out.push({ name, data });
  }
  return out;
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

// Old Word form check box: <w:checked/> wins, otherwise its default value
function legacyChecked(xml: string) {
  if (/<w:checked(?: w:val="(?:1|true)")?\/>/.test(xml)) return true;
  if (/<w:checked w:val="(?:0|false)"\/>/.test(xml)) return false;
  return /<w:default w:val="(?:1|true)"\/>/.test(xml);
}

// Text of one paragraph: runs, tabs, line breaks and both kinds of Word check boxes
function paragraphText(xml: string) {
  let text = '';
  const token = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w14:checked w14:val="(\w+)"\/>|<w:checkBox>[\s\S]*?<\/w:checkBox>|<w:sym [^>]*w:char="(\w+)"[^>]*\/>/g;
  for (const m of xml.matchAll(token)) {
    if (m[1] !== undefined) text += decode(m[1]);
    else if (m[0] === '<w:tab/>') text += ' ';
    else if (m[0] === '<w:br/>') text += ' ';
    else if (m[2] !== undefined) text += m[2] === '1' || m[2] === 'true' ? '☒ ' : '☐ ';            // content-control check box
    else if (m[0].startsWith('<w:checkBox>')) text += legacyChecked(m[0]) ? '☒ ' : '☐ '; // old-style form field
    else if (m[3]) text += ['F0FE', 'F078', 'F0FD'].includes(m[3].toUpperCase()) ? '☒ ' : ['F0A8', 'F06F', 'F071'].includes(m[3].toUpperCase()) ? '☐ ' : ''; // Wingdings boxes
  }
  // a content-control box also contains its ☐/☒ glyph as text: keep only one mark
  return text.replace(/([☐☒]) [☐☒]/g, '$1').replace(/\s+/g, ' ').trim();
}

function bodyToText(xml: string) {
  const lines: string[] = [];
  // tables become "cell | cell" rows; everything else one line per paragraph
  const parts = xml.split(/(<w:tbl>[\s\S]*?<\/w:tbl>)/);
  for (const part of parts) {
    if (part.startsWith('<w:tbl>')) {
      for (const row of part.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) ?? []) {
        const cells = (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((c) =>
          (c.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []).map(paragraphText).filter(Boolean).join(' '));
        if (cells.some(Boolean)) lines.push(cells.map((c) => c || '(empty)').join(' | '));
      }
      lines.push('');
    } else {
      for (const p of part.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []) {
        const t = paragraphText(p);
        if (t) lines.push(t);
      }
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export interface DocxContent {
  text: string;
  images: { name: string; mime: 'image/png' | 'image/jpeg'; data: Buffer }[];
}

export function isDocx(buf: Buffer) {
  return buf.length > 30 && buf.readUInt32LE(0) === 0x04034b50 && buf.includes('word/document.xml');
}

export function readDocx(buf: Buffer): DocxContent {
  const entries = unzip(buf, (n) => n === 'word/document.xml' || n === 'word/_rels/document.xml.rels' || /^word\/media\/[^/]+\.(png|jpe?g)$/i.test(n));
  const doc = entries.find((e) => e.name === 'word/document.xml');
  if (!doc) throw new HttpError(400, 'This is not a Word document');
  const xml = doc.data.toString('utf8');

  // only pictures placed in the body (pasted ID copies, photo), not the logo in the page header
  const rels = entries.find((e) => e.name === 'word/_rels/document.xml.rels')?.data.toString('utf8') ?? '';
  const target = new Map([...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const used = new Set([...xml.matchAll(/r:embed="([^"]+)"/g)].map((m) => `word/${(target.get(m[1]) ?? '').replace(/^\/?word\//, '')}`));
  const images = entries
    .filter((e) => e.name.startsWith('word/media/') && used.has(e.name) && e.data.length > 5_000) // skip icons
    .map((e) => ({ name: e.name.slice(11), mime: (/\.png$/i.test(e.name) ? 'image/png' : 'image/jpeg') as 'image/png' | 'image/jpeg', data: e.data }));
  return { text: bodyToText(xml), images };
}

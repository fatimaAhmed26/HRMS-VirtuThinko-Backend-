import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { HttpError } from './httpError';

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Files live outside the public web root; they are only served through the authenticated download route
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');

// Detect the real file type from its first bytes ("magic numbers"),
// so a .exe renamed to .pdf is rejected even if the browser says it's a PDF
const SIGNATURES: { mime: string; ext: string; bytes: number[] }[] = [
  { mime: 'application/pdf', ext: '.pdf', bytes: [0x25, 0x50, 0x44, 0x46] },                       // %PDF
  { mime: 'image/png', ext: '.png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },      // .PNG....
  { mime: 'image/jpeg', ext: '.jpg', bytes: [0xff, 0xd8, 0xff] },                                   // JPEG
];

export function detectFileType(buffer: Buffer) {
  const match = SIGNATURES.find((s) => s.bytes.every((b, i) => buffer[i] === b));
  if (!match) throw new HttpError(400, 'Only PDF, JPEG and PNG files are allowed');
  return match;
}

export async function saveFile(buffer: Buffer, ext: string) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const storedName = `${crypto.randomUUID()}${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, storedName), buffer, { flag: 'wx' });
  return storedName;
}

export function filePath(storedName: string) {
  // storedName comes from our database (UUID), but double-check it can't escape the folder
  const full = path.join(UPLOAD_DIR, path.basename(storedName));
  if (!full.startsWith(UPLOAD_DIR)) throw new HttpError(400, 'Invalid file');
  return full;
}

// Keep only safe characters from the user's file name (used for display / download name)
export function cleanFileName(name: string) {
  const cleaned = name.normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu, '_').trim();
  return (cleaned || 'file').slice(0, 200);
}
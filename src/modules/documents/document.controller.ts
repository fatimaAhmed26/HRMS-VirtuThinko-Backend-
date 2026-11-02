import { Request } from 'express';
import * as service from './document.service';
import { listQuerySchema, uploadSchema } from './document.schema';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import { filePath } from '../../utils/fileStorage';

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid document id');
  return id;
}

const ip = (req: Request) => req.ip ?? null;

export const upload = asyncHandler(async (req, res) => {
  const input = parse(uploadSchema, req.body ?? {});
  res.status(201).json(await service.upload(req.file!, input, req.user!, ip(req)));
});

export const mine = asyncHandler(async (req, res) => {
  res.json(await service.myDocuments(req.user!));
});

export const list = asyncHandler(async (req, res) => {
  res.json(await service.list(parse(listQuerySchema, req.query)));
});

export const getById = asyncHandler(async (req, res) => {
  res.json(await service.getById(idParam(req), req.user!));
});

export const download = asyncHandler(async (req, res) => {
  const file = await service.prepareDownload(idParam(req), req.user!, ip(req));
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Cache-Control', 'private, no-store');
  // attachment = always download, never run in the browser; ?inline=1 lets the frontend preview it
  res.attachment(file.originalName);
  if (req.query.inline === '1') res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
  await new Promise<void>((resolve, reject) => {
    res.sendFile(filePath(file.storedName), (err) => (err ? reject(new HttpError(404, 'File is missing on the server')) : resolve()));
  });
});

export const remove = asyncHandler(async (req, res) => {
  await service.remove(idParam(req), req.user!, ip(req));
  res.status(204).end();
});
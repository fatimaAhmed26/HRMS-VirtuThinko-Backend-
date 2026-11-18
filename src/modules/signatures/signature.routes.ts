import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import { filePath } from '../../utils/fileStorage';
import * as service from './signature.service';
import { createSignatureSchema, employeeQuerySchema, signSchema } from './signature.schema';

function idOf(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${label}`);
  return id;
}

// The link token is 64 hex characters; anything else is simply not a valid link
function tokenOf(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new HttpError(404, 'This link is not valid');
  return value;
}

// ───── HR (signed in) ─────
export const signatureRouter = Router();
signatureRouter.use(authenticate);

signatureRouter.get('/', requirePermission('document:view'), asyncHandler(async (req, res) => {
  const { employeeId } = parse(employeeQuerySchema, req.query);
  res.json(await service.list(employeeId, req.user!));
}));

signatureRouter.post('/', requirePermission('document:upload'), asyncHandler(async (req, res) => {
  const input = parse(createSignatureSchema, req.body ?? {});
  res.status(201).json(await service.create(input, req.user!, req.ip ?? null));
}));

signatureRouter.post('/:id/cancel', requirePermission('document:upload'), asyncHandler(async (req, res) => {
  res.json(await service.cancel(idOf(req.params.id, 'signature id'), req.user!, req.ip ?? null));
}));

// ───── public (no sign-in) ─────
export const publicSignatureRouter = Router();

publicSignatureRouter.get('/:token', asyncHandler(async (req, res) => {
  res.json(await service.publicInfo(tokenOf(req.params.token)));
}));

publicSignatureRouter.get('/:token/document', asyncHandler(async (req, res) => {
  const file = await service.publicDocument(tokenOf(req.params.token));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
  await new Promise<void>((resolve, reject) => {
    res.sendFile(filePath(file.storedName), (err) => (err ? reject(new HttpError(404, 'File is missing on the server')) : resolve()));
  });
}));

publicSignatureRouter.post('/:token/sign', asyncHandler(async (req, res) => {
  const input = parse(signSchema, req.body ?? {});
  res.json(await service.publicSign(tokenOf(req.params.token), input, req.ip ?? null));
}));

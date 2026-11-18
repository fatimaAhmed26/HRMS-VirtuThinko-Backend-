import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { HttpError } from '../../utils/httpError';
import { MAX_FILE_SIZE } from '../../utils/fileStorage';
import * as service from './onboarding.service';

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

// ───── HR (signed in, employee:create) ─────
export const onboardingRouter = Router();
onboardingRouter.use(authenticate, requirePermission('employee:create'));

onboardingRouter.get('/', asyncHandler(async (_req, res) => {
  res.json(await service.list());
}));

onboardingRouter.post('/', asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.user!, req.ip ?? null));
}));

onboardingRouter.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.details(idOf(req.params.id, 'form id')));
}));

onboardingRouter.get('/:id/files/:key', asyncHandler(async (req, res) => {
  const file = await service.fileFor(idOf(req.params.id, 'form id'), String(req.params.key));
  res.setHeader('Cache-Control', 'private, no-store');
  res.download(file.path, file.name);
}));

onboardingRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  res.json(await service.cancel(idOf(req.params.id, 'form id'), req.user!, req.ip ?? null));
}));

// ───── public (no sign-in) ─────
export const publicOnboardingRouter = Router();

const formUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: service.FILE_KEYS.length },
}).any();

// Wraps multer so its errors become clear 400 messages
function formFiles(req: Request, res: Response, next: NextFunction) {
  formUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 5 MB or less' : 'Too many files'));
    }
    if (err) return next(err as Error);
    next();
  });
}

publicOnboardingRouter.get('/:token', asyncHandler(async (req, res) => {
  res.json(await service.publicInfo(tokenOf(req.params.token)));
}));

publicOnboardingRouter.post('/:token/submit', formFiles, asyncHandler(async (req, res) => {
  const uploads: Record<string, Express.Multer.File> = {};
  for (const file of (req.files as Express.Multer.File[] | undefined) ?? []) uploads[file.fieldname] = file;
  res.json(await service.publicSubmit(tokenOf(req.params.token), req.body?.answers, uploads, req.ip ?? null));
}));

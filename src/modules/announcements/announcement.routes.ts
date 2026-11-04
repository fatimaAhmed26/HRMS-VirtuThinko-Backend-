import { Request, Router } from 'express';
import * as service from './announcement.service';
import { announcementSchema, updateAnnouncementSchema } from './announcement.schema';
import { authenticate, requirePermission } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import { filePath } from '../../utils/fileStorage';

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid announcement id');
  return id;
}
const ip = (req: Request) => req.ip ?? null;

const router = Router();
router.use(authenticate);


router.get('/me', asyncHandler(async (req, res) => res.json(await service.forMe(req.user!))));

// HR management
router.get('/', requirePermission('announcement:manage'), asyncHandler(async (_req, res) => res.json(await service.listAll())));
router.post('/', requirePermission('announcement:manage'), asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(parse(announcementSchema, req.body), req.user!, ip(req)));
}));
router.patch('/:id', requirePermission('announcement:manage'), asyncHandler(async (req, res) => {
  res.json(await service.update(idParam(req), parse(updateAnnouncementSchema, req.body), req.user!, ip(req)));
}));
router.delete('/:id', requirePermission('announcement:manage'), asyncHandler(async (req, res) => {
  await service.remove(idParam(req), req.user!, ip(req));
  res.status(204).end();
}));
router.post('/:id/attachment', requirePermission('announcement:manage'), uploadSingle, asyncHandler(async (req, res) => {
  res.json(await service.attach(idParam(req), req.file!, req.user!, ip(req)));
}));

// anyone it is meant for
router.get('/:id', asyncHandler(async (req, res) => {
  res.json(service.presentOne(await service.getForUser(idParam(req), req.user!)));
}));
router.get('/:id/attachment', asyncHandler(async (req, res) => {
  const a = await service.getForUser(idParam(req), req.user!);
  if (!a.attachmentStoredName) throw new HttpError(404, 'No attachment');
  res.setHeader('Content-Type', a.attachmentMime ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.attachment(a.attachmentName ?? 'attachment');
  res.sendFile(filePath(a.attachmentStoredName));
}));

export default router;
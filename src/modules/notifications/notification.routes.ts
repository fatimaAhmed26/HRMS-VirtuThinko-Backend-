import { Request, Router } from 'express';
import { z } from 'zod';
import prisma from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';

const listQuery = z.object({
  unreadOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function idParam(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid notification id');
  return id;
}

const router = Router();
router.use(authenticate); // every user only ever sees their own notifications

router.get('/', asyncHandler(async (req, res) => {
  const q = parse(listQuery, req.query);
  const where = { userId: req.user!.id, ...(q.unreadOnly ? { readAt: null } : {}) };
  const [items, total, unread] = await prisma.$transaction([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
  ]);
  res.json({ items, unread, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) });
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  res.json({ unread: await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }) });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  const r = await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ updated: r.count });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const r = await prisma.notification.updateMany({ where: { id: idParam(req), userId: req.user!.id }, data: { readAt: new Date() } });
  if (r.count === 0) throw new HttpError(404, 'Notification not found');
  res.json({ ok: true });
}));

export default router;
// Client companies for outsourced staff, each with its own annual leave days (Settings > Organization)
import { Request, Router } from 'express';
import { z } from 'zod';
import prisma from '../../config/prisma';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import { diff, logAudit } from '../../utils/audit';

const clientSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  nameAr: z.string().trim().max(150).optional().nullable(),
  annualLeaveDays: z.number().int().min(0, 'Cannot be negative').max(60),
  active: z.boolean().optional(),
});

function idParam(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid client id');
  return id;
}

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('employee:view', 'settings:manage'), asyncHandler(async (_req, res) => {
  const rows = await prisma.clientCompany.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { employees: { where: { status: 'active' } } } } },
  });
  res.json(rows.map(({ _count, ...c }) => ({ ...c, activeStaff: _count.employees })));
}));

router.post('/', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  const input = parse(clientSchema, req.body);
  const client = await prisma.$transaction(async (tx) => {
    const c = await tx.clientCompany.create({ data: input });
    await logAudit({ actorUserId: req.user!.id, action: 'client.create', entity: 'ClientCompany', entityId: c.id,
      changes: { name: c.name, annualLeaveDays: c.annualLeaveDays }, ip: req.ip ?? null }, tx);
    return c;
  });
  res.status(201).json(client);
}));

router.patch('/:id', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  const id = idParam(req);
  const input = parse(clientSchema.partial(), req.body);
  const before = await prisma.clientCompany.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'Client company not found');
  const client = await prisma.$transaction(async (tx) => {
    const c = await tx.clientCompany.update({ where: { id }, data: input });
    await logAudit({ actorUserId: req.user!.id, action: 'client.update', entity: 'ClientCompany', entityId: id,
      changes: diff(before, input), ip: req.ip ?? null }, tx);
    return c;
  });
  res.json(client);
}));

export default router;
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../config/prisma';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import { diff, logAudit } from '../../utils/audit';

const departmentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  managerId: z.number().int().positive().optional().nullable(),
});

const router = Router();
router.use(authenticate);

// GET /api/departments -> list with manager and employee count
router.get(
  '/',
  requirePermission('department:view', 'employee:view'),
  asyncHandler(async (_req, res) => {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { employees: true } },
      },
    });
    res.json(departments);
  })
);

// POST /api/departments
router.post(
  '/',
  requirePermission('department:manage'),
  asyncHandler(async (req, res) => {
    const input = parse(departmentSchema, req.body);
    const dept = await prisma.$transaction(async (tx) => {
      const d = await tx.department.create({ data: input });
      await logAudit(
        { actorUserId: req.user!.id, action: 'department.create', entity: 'Department', entityId: d.id, changes: { name: d.name }, ip: req.ip ?? null },
        tx
      );
      return d;
    });
    res.status(201).json(dept);
  })
);

// PATCH /api/departments/:id
router.patch(
  '/:id',
  requirePermission('department:manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const input = parse(departmentSchema.partial(), req.body);
    const before = await prisma.department.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, 'Department not found');

    const dept = await prisma.$transaction(async (tx) => {
      const d = await tx.department.update({ where: { id }, data: input });
      await logAudit(
        { actorUserId: req.user!.id, action: 'department.update', entity: 'Department', entityId: id, changes: diff(before, input), ip: req.ip ?? null },
        tx
      );
      return d;
    });
    res.json(dept);
  })
);

export default router;
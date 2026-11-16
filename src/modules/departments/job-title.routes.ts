import { Router, type Request } from 'express';
import { z } from 'zod';
import prisma from '../../config/prisma';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import { diff, logAudit } from '../../utils/audit';

const salary = z.number().nonnegative().max(1_000_000).optional().nullable();
const titleSchema = z
  .object({
    name: z.string().trim().min(1, 'Title is required').max(100),
    grade: z.string().trim().max(20).optional().nullable(),
    country: z.enum(['BH', 'SA']),
    minSalary: salary,
    maxSalary: salary,
  })
  .refine((v) => v.minSalary == null || v.maxSalary == null || v.maxSalary >= v.minSalary, {
    message: 'Maximum salary must be at least the minimum',
    path: ['maxSalary'],
  });

const router = Router();
router.use(authenticate);

// salary bands are pay data: only users who can view payroll receive them
const canSeeBands = (req: Request) => req.user!.permissions.includes('payroll:view');
function present<T extends { minSalary: unknown; maxSalary: unknown }>(title: T, bands: boolean) {
  if (bands) return title;
  const { minSalary, maxSalary, ...rest } = title;
  return rest;
}

// GET /api/job-titles/department/:departmentId
router.get(
  '/department/:departmentId',
  requirePermission('department:view'),
  asyncHandler(async (req, res) => {
    const departmentId = Number(req.params.departmentId);
    const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
    if (!dept) throw new HttpError(404, 'Department not found');

    const titles = await prisma.jobTitle.findMany({
      where: { departmentId },
      orderBy: [{ country: 'asc' }, { name: 'asc' }],
    });
    res.json(titles.map((t) => present(t, canSeeBands(req))));
  })
);

// POST /api/job-titles/department/:departmentId
router.post(
  '/department/:departmentId',
  requirePermission('department:manage'),
  asyncHandler(async (req, res) => {
    const departmentId = Number(req.params.departmentId);
    const input = parse(titleSchema, req.body);
    const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
    if (!dept) throw new HttpError(404, 'Department not found');

    const title = await prisma.$transaction(async (tx) => {
      const t = await tx.jobTitle.create({
        data: {
          departmentId,
          name: input.name,
          grade: input.grade || null,
          country: input.country,
          minSalary: input.minSalary ?? null,
          maxSalary: input.maxSalary ?? null,
        },
      });
      await logAudit(
        { actorUserId: req.user!.id, action: 'job_title.create', entity: 'JobTitle', entityId: t.id, changes: { name: t.name, country: t.country }, ip: req.ip ?? null },
        tx
      );
      return t;
    });
    res.status(201).json(present(title, canSeeBands(req)));
  })
);

// PATCH /api/job-titles/:id
router.patch(
  '/:id',
  requirePermission('department:manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const before = await prisma.jobTitle.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, 'Job title not found');

    // validate the full record so the salary range check also works for partial edits
    const merged = {
      name: before.name,
      grade: before.grade,
      country: before.country,
      minSalary: before.minSalary === null ? null : Number(before.minSalary),
      maxSalary: before.maxSalary === null ? null : Number(before.maxSalary),
      ...(req.body ?? {}),
    };
    const input = parse(titleSchema, merged);

    const data = {
      name: input.name,
      grade: input.grade || null,
      country: input.country,
      minSalary: input.minSalary ?? null,
      maxSalary: input.maxSalary ?? null,
    };
    const title = await prisma.$transaction(async (tx) => {
      const t = await tx.jobTitle.update({ where: { id }, data });
      await logAudit(
        { actorUserId: req.user!.id, action: 'job_title.update', entity: 'JobTitle', entityId: id, changes: diff(before, data), ip: req.ip ?? null },
        tx
      );
      return t;
    });
    res.json(present(title, canSeeBands(req)));
  })
);

// DELETE /api/job-titles/:id
router.delete(
  '/:id',
  requirePermission('department:manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const before = await prisma.jobTitle.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, 'Job title not found');

    await prisma.$transaction(async (tx) => {
      await tx.jobTitle.delete({ where: { id } });
      await logAudit(
        { actorUserId: req.user!.id, action: 'job_title.delete', entity: 'JobTitle', entityId: id, changes: { name: before.name, country: before.country }, ip: req.ip ?? null },
        tx
      );
    });
    res.status(204).end();
  })
);

export default router;

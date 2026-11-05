import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../config/prisma';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').transform((s) => new Date(`${s}T00:00:00.000Z`));
const querySchema = z.object({
  entity: z.string().trim().max(50).optional(),       // Employee, LeaveRequest, PayrollRun...
  entityId: z.string().trim().max(50).optional(),
  action: z.string().trim().max(50).optional(),       // exact ("employee.update") or prefix ("payroll.")
  actorUserId: z.coerce.number().int().positive().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const router = Router();

router.use(authenticate, requirePermission('audit:view'));

router.get('/', asyncHandler(async (req, res) => {
  const q = parse(querySchema, req.query);
  const where: Prisma.AuditLogWhereInput = {
    entity: q.entity, entityId: q.entityId, actorUserId: q.actorUserId,
    action: q.action ? (q.action.endsWith('.') ? { startsWith: q.action } : q.action) : undefined,
    createdAt: q.from || q.to ? { gte: q.from, lte: q.to ? new Date(q.to.getTime() + 86_399_999) : undefined } : undefined,
  };
  const [total, logs] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  const actorIds = [...new Set(logs.map((l) => l.actorUserId).filter((x): x is number => x !== null))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true } });
  const names = new Map(actors.map((a) => [a.id, a.username]));
  res.json({
    items: logs.map((l) => ({ ...l, actor: l.actorUserId ? names.get(l.actorUserId) ?? null : null })),
    page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize),
  });
}));

export default router;
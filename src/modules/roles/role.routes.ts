import { Router } from 'express';
import prisma from '../../config/prisma';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();
router.use(authenticate);

// GET /api/roles -> roles with their permissions and number of users (for the role picker)
router.get(
  '/',
  requirePermission('role:view', 'user:view'),
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({
      orderBy: { id: 'asc' },
      include: {
        permissions: { select: { permission: { select: { name: true } } } },
        _count: { select: { users: true } },
      },
    });
    res.json(
      roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        userCount: r._count.users,
        permissions: r.permissions.map((p) => p.permission.name),
      }))
    );
  })
);

export default router;
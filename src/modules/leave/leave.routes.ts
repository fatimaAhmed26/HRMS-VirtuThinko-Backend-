import { Router } from 'express';
import * as c from './leave.controller';
import { authenticate, requirePermission } from '../../middleware/auth';
import prisma from '../../config/prisma';
import { scopeParam } from '../../utils/scope';
import { teamRouter } from './leave.team';

const router = Router();
router.use(authenticate);
const requestScope = scopeParam(async (id) => (await prisma.leaveRequest.findUnique({ where: { id }, select: { employeeId: true } }))?.employeeId);
  router.param('id', (req, res, next, value) => (req.path.startsWith('/requests/') ? requestScope(req, res, next, value) : next()));
  router.param('employeeId', scopeParam(async (id) => id));
// team calendar and leave planner reservations (everyone)
router.use(teamRouter);

// leave types & public holidays
router.get('/types', c.listTypes);
router.patch('/types/:id', requirePermission('leave:manage'), c.updateType);
router.get('/holidays', c.listHolidays);
router.post('/holidays', requirePermission('leave:manage'), c.addHoliday);
router.delete('/holidays/:id', requirePermission('leave:manage'), c.deleteHoliday);

// balances
router.get('/balances/me', c.myBalances);
router.get('/balances/:employeeId', requirePermission('leave:manage', 'leave:approve'), c.employeeBalances);

// requests (fixed paths before '/:id')
router.post('/requests', requirePermission('leave:request'), c.create);
router.get('/requests/me', c.mine);
router.get('/requests/pending', requirePermission('leave:approve', 'leave:manage'), c.pending);
router.get('/requests', requirePermission('leave:manage'), c.list);
router.get('/requests/:id', c.getById);
router.post('/requests/:id/approve', requirePermission('leave:approve', 'leave:manage'), c.approve);
router.post('/requests/:id/reject', requirePermission('leave:approve', 'leave:manage'), c.reject);
router.post('/requests/:id/cancel', c.cancel);

export default router;
import { Router } from 'express';
import * as c from './leave.controller';
import { authenticate, requirePermission } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

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
import { Router } from 'express';
import * as service from './dashboard.service';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.get('/admin', requirePermission('report:view', 'employee:view'), asyncHandler(async (req, res) => {
  res.json(await service.adminDashboard(req.user!));
}));

router.get('/me', asyncHandler(async (req, res) => {
  res.json(await service.employeeHome(req.user!));
}));

export default router;
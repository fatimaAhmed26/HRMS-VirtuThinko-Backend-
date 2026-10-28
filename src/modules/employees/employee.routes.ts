import { Router } from 'express';
import * as c from './employee.controller';
import { authenticate, requirePermission } from '../../middleware/auth';

const router = Router();

router.use(authenticate); // every route below needs a logged-in user

router.get('/', requirePermission('employee:view'), c.list);
router.get('/me', c.me); // must be before '/:id'
router.get('/:id', requirePermission('employee:view'), c.getById);
router.get('/:id/history', requirePermission('employee:view'), c.history);
router.post('/', requirePermission('employee:create'), c.create);
router.patch('/:id', requirePermission('employee:edit'), c.update);
router.patch('/:id/status', requirePermission('employee:deactivate'), c.setStatus);

export default router;
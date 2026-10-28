import { Router } from 'express';
import * as c from './user.controller';
import { authenticate, requirePermission } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

// any logged-in user: change own password (must be before '/:id')
router.patch('/me/password', c.changeOwnPassword);

// user administration (BR: restricted to authorized administrators)
router.get('/', requirePermission('user:view'), c.list);
router.get('/:id', requirePermission('user:view'), c.getById);
router.post('/', requirePermission('user:manage'), c.create);
router.patch('/:id', requirePermission('user:manage'), c.update);
router.put('/:id/roles', requirePermission('user:manage'), c.setRoles);
router.patch('/:id/status', requirePermission('user:manage'), c.setStatus);
router.post('/:id/reset-password', requirePermission('user:manage'), c.resetPassword);

export default router;
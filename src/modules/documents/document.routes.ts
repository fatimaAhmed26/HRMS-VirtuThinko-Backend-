import { Router } from 'express';
import * as c from './document.controller';
import { authenticate, requirePermission } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import prisma from '../../config/prisma';
import { scopeParam } from '../../utils/scope';

const router = Router();
router.use(authenticate);
router.param('id', scopeParam(async (id) => (await prisma.document.findUnique({ where: { id }, select: { employeeId: true } }))?.employeeId));

router.post('/', requirePermission('document:upload'), uploadSingle, c.upload);
router.get('/me', c.mine);                                   // before '/:id'
router.get('/', requirePermission('document:view'), c.list);
router.get('/:id', c.getById);                               // access checked in the service
router.get('/:id/download', c.download);
router.delete('/:id', requirePermission('document:delete'), c.remove);

export default router;
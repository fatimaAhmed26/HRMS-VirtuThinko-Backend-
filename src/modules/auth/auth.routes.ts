import { Router } from 'express';
import * as controller from './auth.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.post('/login', controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);

export default router;
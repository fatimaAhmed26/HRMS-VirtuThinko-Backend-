import { Router } from 'express';
import * as controller from './auth.controller';
import { authenticate } from '../../middleware/auth';
import { loginLimiter, refreshLimiter } from '../../middleware/rateLimit';

const router = Router();

router.post('/login', ...loginLimiter, controller.login);
router.post('/refresh', refreshLimiter, controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);

export default router;
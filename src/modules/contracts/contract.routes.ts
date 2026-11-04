import { Request, Router } from 'express';
import * as service from './contract.service';
import { createContractSchema, listQuerySchema } from './contract.schema';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid contract id');
  return id;
}

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('contract:view'), asyncHandler(async (req, res) => {
  res.json(await service.list(parse(listQuerySchema, req.query)));
}));

router.get('/:id', requirePermission('contract:view'), asyncHandler(async (req, res) => {
  res.json(await service.getById(idParam(req)));
}));

router.post('/', requirePermission('contract:manage'), asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(parse(createContractSchema, req.body), req.user!, req.ip ?? null));
}));

router.post('/:id/expire', requirePermission('contract:manage'), asyncHandler(async (req, res) => {
  res.json(await service.expire(idParam(req), req.user!, req.ip ?? null));
}));

export default router;
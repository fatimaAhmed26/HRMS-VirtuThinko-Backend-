import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import * as service from './asset.service';
import { assignSchema, createAssetSchema, employeeQuerySchema, returnSchema } from './asset.schema';

const router = Router();
router.use(authenticate);

function idOf(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${label}`);
  return id;
}

router.get('/stock', requirePermission('asset:view'), asyncHandler(async (req, res) => {
  res.json(await service.listStock(req.user!));
}));

router.get('/assignments', requirePermission('asset:view'), asyncHandler(async (req, res) => {
  const { employeeId } = parse(employeeQuerySchema, req.query);
  res.json(await service.forEmployee(employeeId, req.user!));
}));

router.post('/', requirePermission('asset:manage'), asyncHandler(async (req, res) => {
  const input = parse(createAssetSchema, req.body ?? {});
  res.status(201).json(await service.create(input, req.user!, req.ip ?? null));
}));

router.post('/:id/assign', requirePermission('asset:manage'), asyncHandler(async (req, res) => {
  const { employeeId } = parse(assignSchema, req.body ?? {});
  res.status(201).json(await service.assign(idOf(req.params.id, 'asset id'), employeeId, req.user!, req.ip ?? null));
}));

router.post('/assignments/:id/return', requirePermission('asset:manage'), asyncHandler(async (req, res) => {
  const input = parse(returnSchema, req.body ?? {});
  res.json(await service.giveBack(idOf(req.params.id, 'assignment id'), input, req.user!, req.ip ?? null));
}));

export default router;

import { Request, Router } from 'express';
import * as service from './contract.service';
import { createContractSchema, listQuerySchema, terminateSchema } from './contract.schema';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import prisma from '../../config/prisma';
import { assertEmployee, employeeScope, scopeParam } from '../../utils/scope';

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid contract id');
  return id;
}

const router = Router();
router.use(authenticate);
router.param('id', scopeParam(async (id) => (await prisma.contract.findUnique({ where: { id }, select: { employeeId: true } }))?.employeeId));

router.get('/me', asyncHandler(async (req, res) => {
  res.json(await service.mine(req.user!));
}));

router.get('/', requirePermission('contract:view'), asyncHandler(async (req, res) => {
  res.json(await service.list(parse(listQuerySchema, req.query), await employeeScope(req.user!)));
}));

router.get('/:id', requirePermission('contract:view'), asyncHandler(async (req, res) => {
  res.json(await service.getById(idParam(req)));
}));

router.post('/', requirePermission('contract:manage'), asyncHandler(async (req, res) => {
  const input = parse(createContractSchema, req.body);
  await assertEmployee(req.user!, input.employeeId);
  res.status(201).json(await service.create(input, req.user!, req.ip ?? null));
}));

router.post('/:id/expire', requirePermission('contract:manage'), asyncHandler(async (req, res) => {
  res.json(await service.expire(idParam(req), req.user!, req.ip ?? null));
}));

router.post('/:id/terminate', requirePermission('contract:manage'), asyncHandler(async (req, res) => {
  const { reason } = parse(terminateSchema, req.body);
  res.json(await service.terminate(idParam(req), reason, req.user!, req.ip ?? null));
}));

export default router;
import { Request, Router } from 'express';
import * as service from './request.service';
import { commentSchema, completeSchema, createRequestSchema, issueLetterSchema, listQuerySchema, rejectSchema, updateTypeSchema } from './request.schema';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import prisma from '../../config/prisma';
import { assertEmployee, employeeScope, scopeParam } from '../../utils/scope';

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}
const ip = (req: Request) => req.ip ?? null;

const router = Router();
router.use(authenticate);

const requestScope = scopeParam(async (id) => (await prisma.employeeRequest.findUnique({ where: { id }, select: { employeeId: true } }))?.employeeId);
  router.param('id', (req, res, next, value) => (req.path.startsWith('/types/') ? next() : requestScope(req, res, next, value)));

// request types & letter templates
router.get('/types', asyncHandler(async (_req, res) => res.json(await service.listTypes())));
router.patch('/types/:id', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  res.json(await service.updateType(idParam(req), parse(updateTypeSchema, req.body), req.user!, ip(req)));
}));

// employee
router.post('/', requirePermission('request:create'), asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(parse(createRequestSchema, req.body), req.user!, ip(req)));
}));
router.get('/me', asyncHandler(async (req, res) => res.json(await service.mine(req.user!))));
router.post('/:id/cancel', asyncHandler(async (req, res) => res.json(await service.cancel(idParam(req), req.user!, ip(req)))));

// HR
router.get('/', requirePermission('request:view', 'request:process'), asyncHandler(async (req, res) => {
    res.json(await service.list(parse(listQuerySchema, req.query), await employeeScope(req.user!)));}));
router.post('/issue', requirePermission('request:process'), asyncHandler(async (req, res) => {
  const input = parse(issueLetterSchema, req.body);
  await assertEmployee(req.user!, input.employeeId);
  res.status(201).json(await service.issueLetter(input, req.user!, ip(req)));
}));
router.get('/:id', asyncHandler(async (req, res) => res.json(await service.get(idParam(req), req.user!))));
router.post('/:id/start', requirePermission('request:process'), asyncHandler(async (req, res) => {
  res.json(await service.start(idParam(req), req.user!, ip(req)));
}));
router.post('/:id/generate', requirePermission('request:process'), asyncHandler(async (req, res) => {
  res.json(await service.generateLetter(idParam(req), req.user!, ip(req)));
}));
router.post('/:id/approve', requirePermission('request:process'), asyncHandler(async (req, res) => {
  const { comment } = parse(commentSchema, req.body ?? {});
  res.json(await service.approve(idParam(req), comment, req.user!, ip(req)));
}));
router.post('/:id/complete', requirePermission('request:process'), asyncHandler(async (req, res) => {
  const { documentId, comment } = parse(completeSchema, req.body ?? {});
  res.json(await service.complete(idParam(req), documentId, comment, req.user!, ip(req)));
}));
router.post('/:id/reject', requirePermission('request:process'), asyncHandler(async (req, res) => {
  const { comment } = parse(rejectSchema, req.body ?? {});
  res.json(await service.reject(idParam(req), comment, req.user!, ip(req)));
}));

export default router;
import { Request } from 'express';
import prisma from '../../config/prisma';
import * as service from './leave.service';
import { onLeaveDecided, onLeaveRequested } from './leave.notifications';
import {
  createRequestSchema, decisionSchema, holidaySchema, holidaysQuerySchema, listQuerySchema,
  rejectSchema, typesQuerySchema, updateTypeSchema,
} from './leave.schema';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import { assertCountry, employeeScope, entitiesOf } from '../../utils/scope';

function idParam(req: Request, name = 'id'): number {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${name}`);
  return id;
}

const ip = (req: Request) => req.ip ?? null;

async function approverName(req: Request) {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { username: true } });
  return u?.username ?? `user ${req.user!.id}`;
}

// types & holidays (HR can only change their own entity's rules)
export const listTypes = asyncHandler(async (req, res) => {
  let { country } = parse(typesQuerySchema, req.query);
  if (!country && req.user!.employeeId) {
    const emp = await prisma.employee.findUnique({ where: { id: req.user!.employeeId }, select: { country: true } });
    country = emp?.country as 'BH' | 'SA' | undefined;
  }
  res.json(await service.listTypes(country ?? 'BH'));
});

export const updateType = asyncHandler(async (req, res) => {
  const type = await prisma.leaveType.findUnique({ where: { id: idParam(req) }, select: { country: true } });
  if (type) await assertCountry(req.user!, type.country);
  res.json(await service.updateType(idParam(req), parse(updateTypeSchema, req.body), req.user!, ip(req)));
});

export const listHolidays = asyncHandler(async (req, res) => {
  const q = parse(holidaysQuerySchema, req.query);
  res.json(await service.listHolidays(q.country, q.year));
});

export const addHoliday = asyncHandler(async (req, res) => {
  const input = parse(holidaySchema, req.body);
  await assertCountry(req.user!, input.country);
  res.status(201).json(await service.addHoliday(input));
});

export const deleteHoliday = asyncHandler(async (req, res) => {
  const holiday = await prisma.publicHoliday.findUnique({ where: { id: idParam(req) }, select: { country: true } });
  if (holiday) await assertCountry(req.user!, holiday.country);
  await service.deleteHoliday(idParam(req));
  res.status(204).end();
});

// ── balances
export const myBalances = asyncHandler(async (req, res) => {
  if (!req.user!.employeeId) throw new HttpError(400, 'Your account is not linked to an employee record');
  res.json(await service.balances(req.user!.employeeId));
});

export const employeeBalances = asyncHandler(async (req, res) => {
  const employeeId = idParam(req, 'employeeId');
  const user = req.user!;
  if (!user.permissions.includes('leave:manage')) {
    // managers may only see their direct reports
    const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true } });
    if (!user.employeeId || emp?.managerId !== user.employeeId) throw new HttpError(403, 'You can only view your team');
  }
  res.json(await service.balances(employeeId));
});

// requests
export const create = asyncHandler(async (req, res) => {
  const r = await service.createRequest(parse(createRequestSchema, req.body), req.user!, ip(req));
  await onLeaveRequested(r);
  res.status(201).json(r);
});

export const mine = asyncHandler(async (req, res) => {
  res.json(await service.myRequests(req.user!));
});

export const pending = asyncHandler(async (req, res) => {
  res.json(await service.pendingApprovals(req.user!, await entitiesOf(req.user!)));
});

export const list = asyncHandler(async (req, res) => {
  res.json(await service.listRequests(parse(listQuerySchema, req.query), await employeeScope(req.user!)));
});

export const getById = asyncHandler(async (req, res) => {
  res.json(await service.getRequest(idParam(req), req.user!));
});

export const approve = asyncHandler(async (req, res) => {
  const { comment } = parse(decisionSchema, req.body ?? {});
  const r = await service.decide(idParam(req), 'approved', comment, req.user!, await approverName(req), ip(req));
  await onLeaveDecided(r);
  res.json(r);
});

export const reject = asyncHandler(async (req, res) => {
  const { comment } = parse(rejectSchema, req.body ?? {});
  const r = await service.decide(idParam(req), 'rejected', comment, req.user!, await approverName(req), ip(req));
  await onLeaveDecided(r);
  res.json(r);
});

export const cancel = asyncHandler(async (req, res) => {
  res.json(await service.cancel(idParam(req), req.user!, ip(req)));
});
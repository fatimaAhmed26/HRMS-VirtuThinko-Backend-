import { Request } from 'express';
import * as service from './employee.service';
import { createEmployeeSchema, listQuerySchema, statusSchema, updateEmployeeSchema } from './employee.schema';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';

function actorFrom(req: Request): service.Actor {
  const perms = req.user!.permissions;
  return {
    userId: req.user!.id,
    ip: req.ip ?? null,
    canSeeBank: perms.includes('payroll:view') || perms.includes('employee:edit'),
  };
}

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid employee id');
  return id;
}

export const list = asyncHandler(async (req, res) => {
  res.json(await service.list(parse(listQuerySchema, req.query)));
});

// The logged-in employee's own profile (self-service)
export const me = asyncHandler(async (req, res) => {
  const employeeId = req.user!.employeeId;
  if (!employeeId) throw new HttpError(404, 'No employee record is linked to this account');
  res.json(await service.getById(employeeId, true));
});

export const getById = asyncHandler(async (req, res) => {
  res.json(await service.getById(idParam(req), actorFrom(req).canSeeBank));
});

export const create = asyncHandler(async (req, res) => {
  const input = parse(createEmployeeSchema, req.body);
  res.status(201).json(await service.create(input, actorFrom(req)));
});

export const update = asyncHandler(async (req, res) => {
  const input = parse(updateEmployeeSchema, req.body);
  res.json(await service.update(idParam(req), input, actorFrom(req)));
});

export const setStatus = asyncHandler(async (req, res) => {
  const { status, reason } = parse(statusSchema, req.body);
  res.json(await service.setStatus(idParam(req), status, reason, actorFrom(req)));
});

export const history = asyncHandler(async (req, res) => {
  res.json(await service.history(idParam(req)));
});
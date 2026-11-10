import { Request } from 'express';
import { z } from 'zod';
import * as service from './employee.service';
import { acceptanceLetter as buildAcceptanceLetter } from './acceptance-letter.service';
import { createEmployeeSchema, listQuerySchema, statusSchema, updateEmployeeSchema, updateMeSchema } from './employee.schema';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import { assertCountry, employeeScope } from '../../utils/scope';

function actorFrom(req: Request): service.Actor {
  const perms = req.user!.permissions;
  return {
    userId: req.user!.id,
    ip: req.ip ?? null,
    canSeeBank: perms.includes('payroll:view') || perms.includes('employee:edit'),
    canSeeMedical: perms.includes('employee:edit'), // confidential section of the onboarding form
  };
}

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid employee id');
  return id;
}

// only employees of the user's entities (BH / SA)
export const list = asyncHandler(async (req, res) => {
  res.json(await service.list(parse(listQuerySchema, req.query), await employeeScope(req.user!)));
});

// The logged-in employee's own profile (self-service)
export const me = asyncHandler(async (req, res) => {
  const employeeId = req.user!.employeeId;
  if (!employeeId) throw new HttpError(404, 'No employee record is linked to this account');
  res.json(await service.getById(employeeId, true, true)); // your own record, medical included
});

export const getById = asyncHandler(async (req, res) => {
  const actor = actorFrom(req);
  res.json(await service.getById(idParam(req), actor.canSeeBank, actor.canSeeMedical));
});

export const create = asyncHandler(async (req, res) => {
  const input = parse(createEmployeeSchema, req.body);
  await assertCountry(req.user!, input.country ?? 'BH'); // HR can only add staff to their own entity
  res.status(201).json(await service.create(input, actorFrom(req)));
});

export const update = asyncHandler(async (req, res) => {
  const input = parse(updateEmployeeSchema, req.body);
  if (input.country) await assertCountry(req.user!, input.country); // cannot move someone to an entity they don't manage
  res.json(await service.update(idParam(req), input, actorFrom(req)));
});

export const setStatus = asyncHandler(async (req, res) => {
  const { status, reason } = parse(statusSchema, req.body);
  res.json(await service.setStatus(idParam(req), status, reason, actorFrom(req)));
});

export const history = asyncHandler(async (req, res) => {
  res.json(await service.history(idParam(req)));
});

// Employee updates their own contact details
export const updateMe = asyncHandler(async (req, res) => {
  const employeeId = req.user!.employeeId;
  if (!employeeId) throw new HttpError(404, 'No employee record is linked to this account');
  const input = parse(updateMeSchema, req.body);
  res.json(await service.update(employeeId, input, { userId: req.user!.id, ip: req.ip ?? null, canSeeBank: true, canSeeMedical: true }));
});
export const directory = asyncHandler(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : undefined;
  res.json(await service.directory(search));
});

// Internship acceptance letter (PDF, no signature - signed by hand after printing)
const letterQuery = z.object({
  date: z.coerce.date().optional(),
  weeks: z.coerce.number().int().min(1).max(104).optional(),
});

export const acceptanceLetter = asyncHandler(async (req, res) => {
  const { pdf, fileName } = await buildAcceptanceLetter(idParam(req), parse(letterQuery, req.query), actorFrom(req));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(pdf);
});

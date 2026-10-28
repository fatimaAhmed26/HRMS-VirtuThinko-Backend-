import { Request } from 'express';
import * as service from './user.service';
import {
  changePasswordSchema,
  createUserSchema,
  listQuerySchema,
  resetPasswordSchema,
  rolesSchema,
  statusSchema,
  updateUserSchema,
} from './user.schema';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';

function actorFrom(req: Request): service.Actor {
  return { userId: req.user!.id, ip: req.ip ?? null };
}

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid user id');
  return id;
}

export const list = asyncHandler(async (req, res) => {
  res.json(await service.list(parse(listQuerySchema, req.query)));
});

export const getById = asyncHandler(async (req, res) => {
  res.json(await service.getById(idParam(req)));
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(parse(createUserSchema, req.body), actorFrom(req)));
});

export const update = asyncHandler(async (req, res) => {
  res.json(await service.update(idParam(req), parse(updateUserSchema, req.body), actorFrom(req)));
});

export const setRoles = asyncHandler(async (req, res) => {
  const { roleIds } = parse(rolesSchema, req.body);
  res.json(await service.setRoles(idParam(req), roleIds, actorFrom(req)));
});

export const setStatus = asyncHandler(async (req, res) => {
  const { status } = parse(statusSchema, req.body);
  res.json(await service.setStatus(idParam(req), status, actorFrom(req)));
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { password } = parse(resetPasswordSchema, req.body ?? {});
  res.json(await service.resetPassword(idParam(req), password, actorFrom(req)));
});

export const changeOwnPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  res.json(await service.changeOwnPassword(req.user!.id, currentPassword, newPassword, req.ip ?? null));
});
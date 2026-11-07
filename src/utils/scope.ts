import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { HttpError } from './httpError';
import type { AuthUser } from '../types/express';

export const ENTITY_SCOPES = ['ALL', 'BH', 'SA'] as const;

// The entities this user may see read from the database once per request
export async function entitiesOf(user: AuthUser): Promise<string[]> {
  if (!user.entities) {
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { entityScope: true } });
    const scope = u?.entityScope ?? 'ALL';
    user.entities = scope === 'ALL' ? ['BH', 'SA'] : [scope];
  }
  return user.entities;
}

// Prisma filter for "employees this user may see"
export async function employeeScope(user: AuthUser): Promise<Prisma.EmployeeWhereInput> {
  return { country: { in: await entitiesOf(user) } };
}

export async function assertCountry(user: AuthUser, country: string) {
  const entities = await entitiesOf(user);
  if (!entities.includes(country)) {
    throw new HttpError(403, `Your access is limited to ${entities.join(' and ')} - this belongs to ${country}`);
  }
}

// Another employee's record must be inside the user's entities
export async function assertEmployee(user: AuthUser, employeeId: number) {
  if (employeeId === user.employeeId) return;
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { country: true } });
  if (emp) await assertCountry(user, emp.country); // a missing employee is reported as 404 by the route itself
}

// For router.param('id', ...): finds whose record :id is and checks it is in scope before the route runs
export const scopeParam =
  (employeeIdOf: (id: number, req: Request) => Promise<number | null | undefined>) =>
  (req: Request, _res: Response, next: NextFunction, value: string) => {
    const id = Number(value);
    if (!req.user || !Number.isInteger(id) || id <= 0) return next();
    employeeIdOf(id, req)
      .then((employeeId) => (employeeId ? assertEmployee(req.user!, employeeId) : undefined))
      .then(() => next(), next);
  };
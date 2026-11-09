// Team calendar (who is on leave) and the leave planner (reserved dates) - visible to all staff
import { Request, Router } from 'express';
import { z } from 'zod';
import prisma from '../../config/prisma';
import { requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { entitiesOf } from '../../utils/scope';
import type { AuthUser } from '../../types/express';

const DAY_MS = 86_400_000;
const PRIVATE_TYPES = ['SICK', 'MATERNITY', 'IDDAH']; // colleagues only see "On leave"
const RESERVABLE_TYPES = ['ANNUAL', 'HAJJ'];
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
}).refine((r) => r.to >= r.from, { message: 'to must be on or after from', path: ['to'] })
  .refine((r) => r.to.getTime() - r.from.getTime() <= 92 * DAY_MS, { message: 'Range can be at most 3 months', path: ['to'] });

const reservationSchema = z.object({
  leaveTypeId: z.number().int().positive(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  note: z.string().trim().max(255).optional(),
}).refine((r) => r.endDate >= r.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] })
  .refine((r) => r.endDate.getTime() - r.startDate.getTime() < 60 * DAY_MS, { message: 'A reservation can be at most 60 days', path: ['endDate'] });

// HR sees every entity in their scope; everyone else sees colleagues in their own country
async function visibleCountries(user: AuthUser) {
  if (user.permissions.includes('leave:manage')) return entitiesOf(user);
  if (!user.employeeId) return [];
  const me = await prisma.employee.findUnique({ where: { id: user.employeeId }, select: { country: true } });
  return me ? [me.country] : [];
}

const person = { select: { id: true, firstName: true, lastName: true, country: true, department: { select: { name: true } } } };
const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

export async function calendar(user: AuthUser, from: Date, to: Date) {
  const countries = await visibleCountries(user);
  const isHr = user.permissions.includes('leave:manage');
  const overlap = { startDate: { lte: to }, endDate: { gte: from }, employee: { country: { in: countries }, status: 'active' } };

  const [leave, reservations] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { ...overlap, status: 'approved' },
      select: { id: true, startDate: true, endDate: true, days: true, employee: person, leaveType: { select: { code: true, name: true } } },
      orderBy: { startDate: 'asc' },
    }),
    prisma.leaveReservation.findMany({
      where: overlap,
      select: { id: true, startDate: true, endDate: true, employee: person, leaveType: { select: { code: true, name: true } } },
      orderBy: { startDate: 'asc' },
    }),
  ]);

  return {
    leave: leave.map((l) => {
      const hidden = !isHr && l.employee.id !== user.employeeId && PRIVATE_TYPES.includes(l.leaveType.code);
      return {
        id: l.id, employeeId: l.employee.id, name: fullName(l.employee), department: l.employee.department?.name ?? null,
        startDate: l.startDate, endDate: l.endDate, days: l.days,
        type: hidden ? 'PRIVATE' : l.leaveType.code, typeName: hidden ? 'On leave' : l.leaveType.name,
      };
    }),
    reservations: reservations.map((r) => ({
      id: r.id, employeeId: r.employee.id, name: fullName(r.employee), department: r.employee.department?.name ?? null,
      startDate: r.startDate, endDate: r.endDate, type: r.leaveType.code, typeName: r.leaveType.name,
      mine: r.employee.id === user.employeeId,
    })),
  };
}

function requireEmployee(user: AuthUser) {
  if (!user.employeeId) throw new HttpError(400, 'Your account is not linked to an employee record');
  return user.employeeId;
}

export async function myReservations(user: AuthUser) {
  return prisma.leaveReservation.findMany({
    where: { employeeId: requireEmployee(user), endDate: { gte: todayUtc() } },
    include: { leaveType: { select: { id: true, code: true, name: true } } },
    orderBy: { startDate: 'asc' },
  });
}

export async function reserve(user: AuthUser, input: z.infer<typeof reservationSchema>, ip: string | null) {
  const employeeId = requireEmployee(user);
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { country: true, status: true } });
  if (!emp || emp.status !== 'active') throw new HttpError(400, 'Employee record is not active');

  const type = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } });
  if (!type || !type.active || type.country !== emp.country) throw new HttpError(400, 'Leave type not found');
  if (!RESERVABLE_TYPES.includes(type.code)) throw new HttpError(400, 'Only Annual and Hajj leave can be reserved in the planner');
  if (input.startDate <= todayUtc()) throw new HttpError(400, 'Reservations must start in the future');

  const clash = await prisma.leaveReservation.findFirst({
    where: { employeeId, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } },
  });
  if (clash) throw new HttpError(409, 'You already reserved some of these dates');
  const request = await prisma.leaveRequest.findFirst({
    where: { employeeId, status: { in: ['pending_manager', 'pending_hr', 'approved'] }, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } },
  });
  if (request) throw new HttpError(409, `You already have a leave request for these dates (#${request.id})`);

  return prisma.$transaction(async (tx) => {
    const r = await tx.leaveReservation.create({
      data: { employeeId, leaveTypeId: type.id, startDate: input.startDate, endDate: input.endDate, note: input.note },
      include: { leaveType: { select: { id: true, code: true, name: true } } },
    });
    await logAudit({ actorUserId: user.id, action: 'leave.reserve', entity: 'LeaveReservation', entityId: r.id,
      changes: { type: type.code, startDate: input.startDate.toISOString().slice(0, 10), endDate: input.endDate.toISOString().slice(0, 10) }, ip }, tx);
    return r;
  });
}

export async function cancelReservation(user: AuthUser, id: number, ip: string | null) {
  const r = await prisma.leaveReservation.findUnique({ where: { id } });
  if (!r) throw new HttpError(404, 'Reservation not found');
  if (r.employeeId !== user.employeeId && !user.permissions.includes('leave:manage')) {
    throw new HttpError(403, 'You can only remove your own reservations');
  }
  await prisma.$transaction(async (tx) => {
    await tx.leaveReservation.delete({ where: { id } });
    await logAudit({ actorUserId: user.id, action: 'leave.unreserve', entity: 'LeaveReservation', entityId: id, ip }, tx);
  });
}

// ───── routes (mounted inside /api/leave) ─────
const ipOf = (req: Request) => req.ip ?? null;
const idOf = (req: Request) => {
  const id = Number(req.params.reservationId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid reservation id');
  return id;
};

export const teamRouter = Router();

teamRouter.get('/calendar', asyncHandler(async (req, res) => {
  const { from, to } = parse(rangeSchema, req.query);
  res.json(await calendar(req.user!, from, to));
}));
teamRouter.get('/reservations/me', asyncHandler(async (req, res) => res.json(await myReservations(req.user!))));
teamRouter.post('/reservations', requirePermission('leave:request'), asyncHandler(async (req, res) => {
  res.status(201).json(await reserve(req.user!, parse(reservationSchema, req.body), ipOf(req)));
}));
teamRouter.delete('/reservations/:reservationId', asyncHandler(async (req, res) => {
  await cancelReservation(req.user!, idOf(req), ipOf(req));
  res.status(204).end();
}));

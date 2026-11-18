import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { assertCountry, assertEmployee, entitiesOf } from '../../utils/scope';
import type { AuthUser } from '../../types/express';
import { ASSET_PREFIX, type CreateAssetInput, type ReturnInput } from './asset.schema';

const assetSelect = {
  id: true, tag: true, category: true, name: true, serial: true, condition: true, country: true, notes: true, createdAt: true,
} as const;

// Items not currently with anyone, in the entities this user may see
export async function listStock(user: AuthUser) {
  return prisma.asset.findMany({
    where: { country: { in: await entitiesOf(user) }, assignments: { none: { returnedAt: null } } },
    select: assetSelect,
    orderBy: { tag: 'asc' },
    take: 200,
  });
}

export async function create(input: CreateAssetInput, user: AuthUser, ip: string | null) {
  await assertCountry(user, input.country);
  return prisma.$transaction(async (tx) => {
    const seq = (await tx.asset.count({ where: { category: input.category } })) + 1;
    const asset = await tx.asset.create({
      data: { ...input, tag: `${ASSET_PREFIX[input.category]}-${String(seq).padStart(4, '0')}` },
      select: assetSelect,
    });
    await logAudit(
      { actorUserId: user.id, action: 'asset.create', entity: 'Asset', entityId: asset.id, changes: { tag: asset.tag, name: asset.name }, ip },
      tx
    );
    return asset;
  });
}

export async function assign(assetId: number, employeeId: number, user: AuthUser, ip: string | null) {
  await assertEmployee(user, employeeId);
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { country: true, status: true } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (employee.status !== 'active') throw new HttpError(400, 'Items can only be given to active employees');

  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { id: assetId }, select: { tag: true, country: true } });
    if (!asset) throw new HttpError(404, 'Asset not found');
    if (asset.country !== employee.country) {
      throw new HttpError(400, `${asset.tag} belongs to ${asset.country}; this employee is in ${employee.country}`);
    }
    const open = await tx.assetAssignment.count({ where: { assetId, returnedAt: null } });
    if (open > 0) throw new HttpError(409, `${asset.tag} is already with someone. Mark it returned first.`);

    const row = await tx.assetAssignment.create({
      data: { assetId, employeeId, assignedByUserId: user.id },
      select: { id: true, employeeId: true, assignedAt: true, returnedAt: true, returnCondition: true },
    });
    await logAudit(
      { actorUserId: user.id, action: 'asset.assign', entity: 'Asset', entityId: assetId, changes: { employeeId, assignment: row.id }, ip },
      tx
    );
    return row;
  });
}

export async function giveBack(assignmentId: number, input: ReturnInput, user: AuthUser, ip: string | null) {
  const current = await prisma.assetAssignment.findUnique({
    where: { id: assignmentId },
    select: { assetId: true, employeeId: true, returnedAt: true },
  });
  if (!current) throw new HttpError(404, 'Assignment not found');
  await assertEmployee(user, current.employeeId);
  if (current.returnedAt) throw new HttpError(400, 'This item is already marked as returned');

  return prisma.$transaction(async (tx) => {
    const row = await tx.assetAssignment.update({
      where: { id: assignmentId },
      data: { returnedAt: new Date(), returnCondition: input.condition },
      select: { id: true, employeeId: true, assignedAt: true, returnedAt: true, returnCondition: true },
    });
    await tx.asset.update({ where: { id: current.assetId }, data: { condition: input.condition } });
    await logAudit(
      { actorUserId: user.id, action: 'asset.return', entity: 'Asset', entityId: current.assetId, changes: { assignment: assignmentId, condition: input.condition }, ip },
      tx
    );
    return row;
  });
}

// Everything an employee has held, items still with them first (NULL sorts first in ascending order)
export async function forEmployee(employeeId: number, user: AuthUser) {
  await assertEmployee(user, employeeId);
  return prisma.assetAssignment.findMany({
    where: { employeeId },
    select: {
      id: true, assignedAt: true, returnedAt: true, returnCondition: true,
      asset: { select: assetSelect },
    },
    orderBy: [{ returnedAt: 'asc' }, { assignedAt: 'desc' }],
  });
}

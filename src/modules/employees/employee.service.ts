import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { decrypt, encrypt, mask } from '../../utils/crypto';
import { diff, logAudit } from '../../utils/audit';
import type { CreateEmployeeInput, ListEmployeesQuery, UpdateEmployeeInput } from './employee.schema';

export interface Actor {
  userId: number;
  ip: string | null;
  canSeeBank: boolean; // full bank account number, or masked
}

const listSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  jobTitle: true,
  status: true,
  hireDate: true,
  photoUrl: true,
  department: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.EmployeeSelect;

const detailInclude = {
  department: { select: { id: true, name: true } },
  manager: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
  user: { select: { id: true, username: true, status: true } },
} satisfies Prisma.EmployeeInclude;

type EmployeeDetail = Prisma.EmployeeGetPayload<{ include: typeof detailInclude }>;

function present(emp: EmployeeDetail, canSeeBank: boolean) {
  let bankAccountNumber: string | null = null;
  if (emp.bankAccountNumber) {
    const plain = decrypt(emp.bankAccountNumber);
    bankAccountNumber = canSeeBank ? plain : mask(plain);
  }
  return { ...emp, bankAccountNumber };
}

async function nextEmployeeCode(tx: Prisma.TransactionClient) {
  const last = await tx.employee.findFirst({
    where: { employeeCode: { startsWith: 'VT-' } },
    orderBy: { id: 'desc' },
    select: { employeeCode: true },
  });
  const lastNumber = last ? parseInt(last.employeeCode.slice(3), 10) || 0 : 0;
  return `VT-${String(lastNumber + 1).padStart(4, '0')}`;
}

// Make sure the department / manager exist before saving
async function checkReferences(data: { departmentId?: number | null; managerId?: number | null }, selfId?: number) {
  if (data.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!dept) throw new HttpError(400, 'Department not found');
  }
  if (data.managerId) {
    if (data.managerId === selfId) throw new HttpError(400, 'An employee cannot be their own manager');
    const manager = await prisma.employee.findUnique({ where: { id: data.managerId } });
    if (!manager || manager.status !== 'active') throw new HttpError(400, 'Manager not found or inactive');
  }
}

export async function list(q: ListEmployeesQuery) {
  const where: Prisma.EmployeeWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.departmentId) where.departmentId = q.departmentId;
  if (q.jobTitle) where.jobTitle = { contains: q.jobTitle };
  if (q.search) {
    where.OR = [
      { firstName: { contains: q.search } },
      { lastName: { contains: q.search } },
      { employeeCode: { contains: q.search } },
      { email: { contains: q.search } },
      { jobTitle: { contains: q.search } },
      { department: { name: { contains: q.search } } },
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      select: listSelect,
      orderBy: { id: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
}

export async function getById(id: number, canSeeBank: boolean) {
  const emp = await prisma.employee.findUnique({ where: { id }, include: detailInclude });
  if (!emp) throw new HttpError(404, 'Employee not found');
  return present(emp, canSeeBank);
}

export async function create(input: CreateEmployeeInput, actor: Actor) {
  await checkReferences(input);

  const created = await prisma.$transaction(async (tx) => {
    const employeeCode = input.employeeCode || (await nextEmployeeCode(tx));
    const emp = await tx.employee.create({
      data: {
        ...input,
        employeeCode,
        bankAccountNumber: input.bankAccountNumber ? encrypt(input.bankAccountNumber) : null,
      },
      include: detailInclude,
    });
    await logAudit(
      {
        actorUserId: actor.userId,
        action: 'employee.create',
        entity: 'Employee',
        entityId: emp.id,
        changes: { employeeCode, name: `${emp.firstName} ${emp.lastName}` },
        ip: actor.ip,
      },
      tx
    );
    return emp;
  });

  return present(created, actor.canSeeBank);
}

export async function update(id: number, input: UpdateEmployeeInput, actor: Actor) {
  const before = await prisma.employee.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'Employee not found');
  await checkReferences(input, id);

  // compare against the decrypted bank number so re-saving the same value isn't a "change"
  const beforePlain = {
    ...before,
    bankAccountNumber: before.bankAccountNumber ? decrypt(before.bankAccountNumber) : null,
  };
  const changes = diff(beforePlain, input);
  if (Object.keys(changes).length === 0) return getById(id, actor.canSeeBank);

  const data: Prisma.EmployeeUncheckedUpdateInput = { ...input };
  if (input.bankAccountNumber !== undefined) {
    data.bankAccountNumber = input.bankAccountNumber ? encrypt(input.bankAccountNumber) : null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const emp = await tx.employee.update({ where: { id }, data, include: detailInclude });
    await logAudit(
      { actorUserId: actor.userId, action: 'employee.update', entity: 'Employee', entityId: id, changes, ip: actor.ip },
      tx
    );
    return emp;
  });

  return present(updated, actor.canSeeBank);
}

export async function setStatus(id: number, status: 'active' | 'inactive', reason: string | undefined, actor: Actor) {
  const before = await prisma.employee.findUnique({
    where: { id },
    select: { status: true, user: { select: { id: true } } },
  });
  if (!before) throw new HttpError(404, 'Employee not found');
  if (before.status === status) throw new HttpError(400, `Employee is already ${status}`);

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { status } });
    // an inactive employee must not be able to log in
    if (before.user) await tx.user.update({ where: { id: before.user.id }, data: { status } });
    await logAudit(
      {
        actorUserId: actor.userId,
        action: status === 'inactive' ? 'employee.deactivate' : 'employee.reactivate',
        entity: 'Employee',
        entityId: id,
        changes: { status: { from: before.status, to: status }, reason: reason ?? null },
        ip: actor.ip,
      },
      tx
    );
  });

  return getById(id, actor.canSeeBank);
}

export async function history(id: number) {
  const exists = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new HttpError(404, 'Employee not found');

  const logs = await prisma.auditLog.findMany({
    where: { entity: 'Employee', entityId: String(id) },
    orderBy: { createdAt: 'desc' },
  });

  // attach the username of whoever made each change
  const actorIds = [...new Set(logs.map((l) => l.actorUserId).filter((x): x is number => x !== null))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true } });
  const nameById = new Map(actors.map((a) => [a.id, a.username]));

  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    changes: l.changes,
    actor: l.actorUserId ? { id: l.actorUserId, username: nameById.get(l.actorUserId) ?? null } : null,
    createdAt: l.createdAt,
  }));
}
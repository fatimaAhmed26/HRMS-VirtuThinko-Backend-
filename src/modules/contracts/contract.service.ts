import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import type { AuthUser } from '../../types/express';
import { CURRENCY } from '../payroll/payroll.rules';
import type { CreateContractInput, ListContractsQuery } from './contract.schema';

const contractInclude = {
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, country: true } },
  document: { select: { id: true, originalName: true } },
} satisfies Prisma.ContractInclude;

export async function list(q: ListContractsQuery) {
  const where: Prisma.ContractWhereInput = {};
  if (q.employeeId) where.employeeId = q.employeeId;
  if (q.status) where.status = q.status;
  if (q.expiringWithinDays !== undefined) {
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + q.expiringWithinDays);
    Object.assign(where, { status: 'active', endDate: { not: null, lte: until } });
  }
  return prisma.contract.findMany({ where, include: contractInclude, orderBy: [{ employeeId: 'asc' }, { startDate: 'desc' }] });
}

export async function getById(id: number) {
  const c = await prisma.contract.findUnique({ where: { id }, include: contractInclude });
  if (!c) throw new HttpError(404, 'Contract not found');
  return c;
}

// BR-4.10: a new contract becomes the single active one; the previous active contract is expired
export async function create(input: CreateContractInput, user: AuthUser, ip: string | null) {
  const emp = await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true, country: true, status: true } });
  if (!emp) throw new HttpError(404, 'Employee not found');
  if (emp.status !== 'active') throw new HttpError(400, 'Employee is not active');
  if (input.documentId) {
    const doc = await prisma.document.findFirst({ where: { id: input.documentId, deletedAt: null } });
    if (!doc || doc.employeeId !== emp.id) throw new HttpError(400, 'Contract document not found for this employee');
  }

  const previous = await prisma.contract.findFirst({ where: { employeeId: emp.id, status: 'active' } });

  return prisma.$transaction(async (tx) => {
    if (previous) await tx.contract.update({ where: { id: previous.id }, data: { status: 'expired' } });
    const contract = await tx.contract.create({
      data: {
        employeeId: emp.id,
        contractType: input.contractType,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        basicSalary: input.basicSalary,
        housingAllowance: input.housingAllowance,
        transportAllowance: input.transportAllowance,
        currency: CURRENCY[emp.country]?.code ?? 'BHD',
        documentId: input.documentId ?? null,
        notes: input.notes,
        createdByUserId: user.id,
      },
      include: contractInclude,
    });
    // salary changes are always audited
    await logAudit({
      actorUserId: user.id, action: 'contract.create', entity: 'Contract', entityId: contract.id,
      changes: {
        employeeId: emp.id,
        replacedContractId: previous?.id ?? null,
        basicSalary: { from: previous?.basicSalary.toFixed() ?? null, to: contract.basicSalary.toFixed() },
        housingAllowance: { from: previous?.housingAllowance.toFixed() ?? null, to: contract.housingAllowance.toFixed() },
        transportAllowance: { from: previous?.transportAllowance.toFixed() ?? null, to: contract.transportAllowance.toFixed() },
      },
      ip,
    }, tx);
    return contract;
  });
}

export async function expire(id: number, user: AuthUser, ip: string | null) {
  const c = await getById(id);
  if (c.status !== 'active') throw new HttpError(400, 'Contract is already expired');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.contract.update({ where: { id }, data: { status: 'expired' }, include: contractInclude });
    await logAudit({ actorUserId: user.id, action: 'contract.expire', entity: 'Contract', entityId: id, ip }, tx);
    return updated;
  });
}
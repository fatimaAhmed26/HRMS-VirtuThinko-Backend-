import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { decrypt, encrypt, mask } from '../../utils/crypto';
import { diff, logAudit } from '../../utils/audit';
import type { CreateEmployeeInput, ListEmployeesQuery, UpdateEmployeeInput } from './employee.schema';

export interface Actor {
  userId: number;
  ip: string | null;
  canSeeBank: boolean;    // full bank account number, or masked
  canSeeMedical: boolean; // confidential medical section (HR with employee:edit, or the employee themselves)
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
  employmentType: true,
  country: true,
  department: { select: { id: true, name: true } },
  clientCompany: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.EmployeeSelect;

const detailInclude = {
  department: { select: { id: true, name: true } },
  clientCompany: { select: { id: true, name: true, annualLeaveDays: true } },
  manager: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
  user: { select: { id: true, username: true, status: true } },
  dependants: { orderBy: { id: 'asc' } },
  qualifications: { orderBy: [{ kind: 'asc' }, { id: 'asc' }] },
  previousEmployments: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.EmployeeInclude;

type EmployeeDetail = Prisma.EmployeeGetPayload<{ include: typeof detailInclude }>;

function present(emp: EmployeeDetail, canSeeBank: boolean, canSeeMedical: boolean) {
  let bankAccountNumber: string | null = null;
  if (emp.bankAccountNumber) {
    const plain = decrypt(emp.bankAccountNumber);
    bankAccountNumber = canSeeBank ? plain : mask(plain);
  }
  const medical = canSeeMedical
    ? {
        medicalDetails: emp.medicalDetails ? decrypt(emp.medicalDetails) : null,
        regularMedication: emp.regularMedication ? decrypt(emp.regularMedication) : null,
      }
    : { hasMedicalCondition: null, medicalDetails: null, bloodGroup: null, regularMedication: null };
  return { ...emp, bankAccountNumber, ...medical };
}

const ADDRESS_PARTS = ['addressFlat', 'addressBuilding', 'addressRoad', 'addressBlock', 'addressCity', 'addressCountry'] as const;

const encryptOrNull = (v: string | null | undefined) => (v === undefined ? undefined : v ? encrypt(v) : null);

// Join the address parts into the one-line address used everywhere else
function joinAddress(i: UpdateEmployeeInput) {
  const parts = [
    i.addressFlat && `Flat ${i.addressFlat}`,
    i.addressBuilding && `Bldg ${i.addressBuilding}`,
    i.addressRoad && `Road ${i.addressRoad}`,
    i.addressBlock && `Block ${i.addressBlock}`,
    i.addressCity,
    i.addressCountry,
  ].filter(Boolean);
  return parts.length ? parts.join(', ').slice(0, 255) : undefined;
}

// Split the form into employee columns and the repeating sections; encrypt what must be encrypted
function toColumns(input: UpdateEmployeeInput) {
  const { dependants, qualifications, previousEmployments, documentChecklist, ...rest } = input;
  const columns = {
    ...rest,
    address: rest.address ?? joinAddress(rest),
    bankAccountNumber: encryptOrNull(rest.bankAccountNumber),
    medicalDetails: encryptOrNull(rest.medicalDetails),
    regularMedication: encryptOrNull(rest.regularMedication),
    documentChecklist: documentChecklist === null ? Prisma.DbNull : documentChecklist,
  };
  const ordered = previousEmployments?.map((p, sortOrder) => ({ ...p, sortOrder }));
  return { columns, dependants, qualifications, previousEmployments: ordered };
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

// Make sure the department / manager / client company exist before saving
  async function checkReferences(
    data: { departmentId?: number | null; managerId?: number | null; clientCompanyId?: number | null },
   selfId?: number
    ) {
    if (data.clientCompanyId) {
    const client = await prisma.clientCompany.findUnique({ where: { id: data.clientCompanyId } });
    if (!client || !client.active) throw new HttpError(400, 'Client company not found or inactive');
  }
  if (data.managerId) {
    if (data.managerId === selfId) throw new HttpError(400, 'An employee cannot be their own manager');
    const manager = await prisma.employee.findUnique({ where: { id: data.managerId } });
    if (!manager || manager.status !== 'active') throw new HttpError(400, 'Manager not found or inactive');
  }
}

export async function list(q: ListEmployeesQuery, scope: Prisma.EmployeeWhereInput = {}) {
  const where: Prisma.EmployeeWhereInput = { ...scope };
  if (q.status) where.status = q.status;
  if (q.departmentId) where.departmentId = q.departmentId;
  if (q.jobTitle) where.jobTitle = { contains: q.jobTitle };
  if (q.employmentType) where.employmentType = q.employmentType;
  if (q.clientCompanyId) where.clientCompanyId = q.clientCompanyId;
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

export async function getById(id: number, canSeeBank: boolean, canSeeMedical = false) {
  const emp = await prisma.employee.findUnique({ where: { id }, include: detailInclude });
  if (!emp) throw new HttpError(404, 'Employee not found');
  return present(emp, canSeeBank, canSeeMedical);
}

export async function create(input: CreateEmployeeInput, actor: Actor) {
  if (input.employmentType === 'Outsourced' && !input.clientCompanyId) {
    throw new HttpError(400, 'Outsourced staff need a client company');
  }
  await checkReferences(input);

  const { columns, dependants, qualifications, previousEmployments } = toColumns(input);
  const created = await prisma.$transaction(async (tx) => {
    const employeeCode = input.employeeCode || (await nextEmployeeCode(tx));
    const emp = await tx.employee.create({
      data: {
        ...columns,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        employeeCode,
        verifiedByUserId: actor.userId, // HR who received and verified the form
        verifiedAt: input.verifiedAt ?? new Date(),
        dependants: dependants?.length ? { createMany: { data: dependants } } : undefined,
        qualifications: qualifications?.length ? { createMany: { data: qualifications } } : undefined,
        previousEmployments: previousEmployments?.length ? { createMany: { data: previousEmployments } } : undefined,
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

  return present(created, actor.canSeeBank, actor.canSeeMedical);
}

export async function update(id: number, input: UpdateEmployeeInput, actor: Actor) {
  const before = await prisma.employee.findUnique({ where: { id }, include: { user: { select: { id: true } } } });
  if (!before) throw new HttpError(404, 'Employee not found');
  await checkReferences(input, id);
  // interns have no portal login
  if (input.employmentType === 'Intern' && before.user) {
    throw new HttpError(400, 'This person has a portal account - deactivate or unlink it before making them an intern');  }
  const type = input.employmentType !== undefined ? input.employmentType : before.employmentType;
  const client = input.clientCompanyId !== undefined ? input.clientCompanyId : before.clientCompanyId;
  if (type === 'Outsourced' && !client) throw new HttpError(400, 'Outsourced staff need a client company');
  // compare against decrypted values so re-saving the same value isn't a "change"
  const beforePlain = {
    ...before,
    bankAccountNumber: before.bankAccountNumber ? decrypt(before.bankAccountNumber) : null,
    medicalDetails: before.medicalDetails ? decrypt(before.medicalDetails) : null,
    regularMedication: before.regularMedication ? decrypt(before.regularMedication) : null,
  };
  const { dependants, qualifications, previousEmployments, ...scalars } = input;
  const changes: Record<string, unknown> = diff(beforePlain, scalars);
  // repeating sections are replaced as a whole
  if (dependants) changes.dependants = `replaced (${dependants.length})`;
  if (qualifications) changes.qualifications = `replaced (${qualifications.length})`;
  if (previousEmployments) changes.previousEmployments = `replaced (${previousEmployments.length})`;
  if (Object.keys(changes).length === 0) return getById(id, actor.canSeeBank, actor.canSeeMedical);

  const parts = toColumns(input);
  // address is only re-joined when the address parts were sent
  const data: Prisma.EmployeeUncheckedUpdateInput = { ...parts.columns };
  if (input.address === undefined && !ADDRESS_PARTS.some((k) => input[k] !== undefined)) delete data.address;

  const updated = await prisma.$transaction(async (tx) => {
    if (parts.dependants) {
      await tx.dependant.deleteMany({ where: { employeeId: id } });
      await tx.dependant.createMany({ data: parts.dependants.map((d) => ({ ...d, employeeId: id })) });
    }
    if (parts.qualifications) {
      await tx.qualification.deleteMany({ where: { employeeId: id } });
      await tx.qualification.createMany({ data: parts.qualifications.map((q) => ({ ...q, employeeId: id })) });
    }
    if (parts.previousEmployments) {
      await tx.previousEmployment.deleteMany({ where: { employeeId: id } });
      await tx.previousEmployment.createMany({ data: parts.previousEmployments.map((p) => ({ ...p, employeeId: id })) });
    }
    const emp = await tx.employee.update({ where: { id }, data, include: detailInclude });
    await logAudit(
      { actorUserId: actor.userId, action: 'employee.update', entity: 'Employee', entityId: id, changes: changes as Prisma.InputJsonValue, ip: actor.ip },
      tx
    );
    return emp;
  });

  return present(updated, actor.canSeeBank, actor.canSeeMedical);
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

  return getById(id, actor.canSeeBank, actor.canSeeMedical);
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
// Colleague directory for every signed-in user: work contact details only (no phone, CPR or address)
export async function directory(search?: string) {
  const s = search?.trim();
  return prisma.employee.findMany({
    where: {
      status: 'active',
      ...(s ? { OR: [{ firstName: { contains: s } }, { lastName: { contains: s } }, { jobTitle: { contains: s } }, { department: { name: { contains: s } } }] } : {}),
    },
    select: { id: true, firstName: true, lastName: true, jobTitle: true, email: true, photoUrl: true, department: { select: { name: true } } },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 200,
  });
}

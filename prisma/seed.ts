import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { LEAVE_TYPES } from './leave-types';
const prisma = new PrismaClient();

// module -> actions  (permission name = "module:action")
const PERMISSIONS: Record<string, string[]> = {
  employee:     ['view', 'create', 'edit', 'deactivate', 'export'],
  department:   ['view', 'manage'],
  leave:        ['view', 'request', 'approve', 'manage'],
  payroll:      ['view', 'create', 'edit', 'approve', 'process'],
  contract:     ['view', 'manage'],
  document:     ['view', 'upload', 'delete'],
  request:      ['view', 'create', 'process'],
  announcement: ['view', 'manage'],
  report:       ['view', 'export'],
  user:         ['view', 'manage'],
  role:         ['view', 'manage'],
  audit:        ['view'],
  settings:     ['manage'],
};

const ALL = Object.entries(PERMISSIONS).flatMap(([mod, actions]) => actions.map((a) => `${mod}:${a}`));
const all = (mod: string) => ALL.filter((p) => p.startsWith(`${mod}:`));

const SELF = ['leave:request', 'request:create', 'document:upload', 'announcement:view'];

const ROLES: Record<string, { description: string; perms: string[] }> = {
  'Super Admin': { description: 'Full system access', perms: ALL },
  'HR Admin': {
    description: 'Employees, leave, payroll, contracts, documents',
    perms: ALL.filter((p) => !['user:manage', 'role:manage', 'settings:manage', 'audit:view'].includes(p)),
  },
  'HR Officer': {
    description: 'Day-to-day HR operations',
    perms: [
      'employee:view', 'employee:create', 'employee:edit',
      ...all('leave'), ...all('document'), ...all('request'), ...all('announcement'),
      'contract:view', 'department:view', 'report:view',
    ],
  },
  'Payroll Officer': {
    description: 'Processes payroll, allowances and deductions',
    perms: [...all('payroll'), 'employee:view', 'contract:view', ...all('report'), ...SELF],
  },
  Manager: {
    description: 'Reviews team and approves assigned requests',
    perms: ['employee:view', 'leave:view', 'leave:approve', 'request:view', 'report:view', ...SELF],
  },
  Employee: { description: 'Self-service access to own records', perms: SELF },
};

async function main() {
  for (const name of ALL) {
    await prisma.permission.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const [name, { description, perms }] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description },
      create: { name, description },
    });
    const permRows = await prisma.permission.findMany({ where: { name: { in: [...new Set(perms)] } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permRows.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env');

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { username: 'superadmin', email, passwordHash: await bcrypt.hash(password, 12) },
  });

  const superRole = await prisma.role.findUniqueOrThrow({ where: { name: 'Super Admin' } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superRole.id } },
    update: {},
    create: { userId: admin.id, roleId: superRole.id },
  });

  console.log(`Seeded ${ALL.length} permissions, ${Object.keys(ROLES).length} roles, admin: ${email}`);
  for (const t of LEAVE_TYPES) {
    await prisma.leaveType.upsert({
      where: { country_code: { country: t.country, code: t.code } },
      update: {},
      create: {
        country: t.country,
        code: t.code,
        name: t.name,
        description: t.description ?? null,
        allowance: t.allowance,
        days: t.days,
        daysAfterYears: t.daysAfterYears ?? null,
        daysAfter: t.daysAfter ?? null,
        accrueFirstYear: t.accrueFirstYear ?? false,
        payTiers: t.payTiers ?? undefined,
        minServiceMonths: t.minServiceMonths ?? 0,
        gender: t.gender ?? null,
        oncePerEmployment: t.oncePerEmployment ?? false,
        requiresAttachment: t.requiresAttachment ?? false,
        countWorkingDays: t.countWorkingDays ?? false,
      },
    });
  }
  console.log(`Seeded ${LEAVE_TYPES.length} leave types`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
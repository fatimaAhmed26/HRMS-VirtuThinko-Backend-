// Test employee with only the Employee role. Run: npx tsx scripts/create-test-employee.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

const USERNAME = 'test.employee';
const EMAIL = 'test.employee@virtuthinko.com';
const CODE = 'TEST-0001';

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: USERNAME } });
  if (existing) {
    console.log(`"${USERNAME}" already exists - nothing changed. Delete it or reset its password in Users to start again.`);
    return;
  }

  const role = await prisma.role.findUnique({ where: { name: 'Employee' } });
  if (!role) throw new Error('The "Employee" role is missing - run "npm run seed" first');

  const department = await prisma.department.findFirst({ orderBy: { id: 'asc' } });
  const password = process.env.TEST_EMPLOYEE_PASSWORD || randomBytes(9).toString('base64url');
  const today = new Date(new Date().toISOString().slice(0, 10));

  const { employee, user } = await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        employeeCode: CODE,
        firstName: 'Test',
        lastName: 'Employee',
        email: EMAIL,
        jobTitle: 'Test Employee',
        departmentId: department?.id ?? null,
        country: 'BH',
        nationality: 'Bahraini',
        isNational: true,
        gender: 'Female',
        employmentType: 'Full-time',
        hireDate: today,
        phone: '+973 3000 0000',
      },
    });
    const user = await tx.user.create({
      data: {
        username: USERNAME,
        email: EMAIL,
        passwordHash: await bcrypt.hash(password, 12),
        employeeId: employee.id,
        entityScope: 'BH',
        roles: { create: [{ roleId: role.id }] },
      },
    });
    return { employee, user };
  });

  console.log('Test employee created');
  console.log(`  Employee:  ${employee.firstName} ${employee.lastName} (${employee.employeeCode})${department ? `, ${department.name}` : ''}`);
  console.log(`  Login:     ${user.username}  or  ${user.email}`);
  console.log(process.env.TEST_EMPLOYEE_PASSWORD ? '  Password:  the TEST_EMPLOYEE_PASSWORD from .env' : `  Password:  ${password}   (shown only now - write it down)`);
  console.log('  Role:      Employee (self-service only, no manager / HR / payroll access)');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

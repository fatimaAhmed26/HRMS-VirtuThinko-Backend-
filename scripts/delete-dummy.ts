// Removes the dummy data made by scripts/seed-dummy.ts: employees with codes DUM-*, their logins and their records.
// Run: npx tsx scripts/delete-dummy.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dummy = await prisma.employee.findMany({ where: { employeeCode: { startsWith: 'DUM-' } }, select: { id: true } });
  const ids = dummy.map((e) => e.id);
  if (ids.length === 0) {
    console.log('No dummy employees found.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.department.updateMany({ where: { managerId: { in: ids } }, data: { managerId: null } });
    await tx.employee.updateMany({ where: { managerId: { in: ids } }, data: { managerId: null } });
    await tx.leaveRequest.deleteMany({ where: { employeeId: { in: ids } } }); // approvals go with them
    await tx.leaveReservation.deleteMany({ where: { employeeId: { in: ids } } });
    await tx.payslip.deleteMany({ where: { employeeId: { in: ids } } });
    await tx.payItem.deleteMany({ where: { employeeId: { in: ids } } });
    await tx.contract.deleteMany({ where: { employeeId: { in: ids } } });
    await tx.document.deleteMany({ where: { employeeId: { in: ids } } });
    await tx.employeeRequest.deleteMany({ where: { employeeId: { in: ids } } });
    await tx.user.deleteMany({ where: { employeeId: { in: ids } } }); // role links go with them
    await tx.employee.deleteMany({ where: { id: { in: ids } } }); // dependants and qualifications go with them
  });

  console.log(`Deleted ${ids.length} dummy employees, their logins and their records.`);
  console.log('Departments (Human Resources, Information Technology, Finance, Operations) were kept; delete them in Settings if you do not need them.');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

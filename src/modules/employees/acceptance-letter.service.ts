// Builds an intern's acceptance letter from their employee record and internship contract
import prisma from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { getSettings } from '../../utils/settings';
import { letterDate, longDate } from '../../utils/letterhead';
import { renderAcceptanceLetter } from './acceptance-letter.pdf';

const WEEK_MS = 7 * 86_400_000;

export interface LetterOptions {
  date?: Date;   // letter date (default today)
  weeks?: number; // duration shown in the letter (default: calculated from the contract dates)
}

export async function acceptanceLetter(employeeId: number, opts: LetterOptions, actor: { userId: number; ip: string | null }) {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      firstName: true, lastName: true, cprNumber: true, nationality: true, employmentType: true, jobTitle: true, hireDate: true,
      department: { select: { name: true } },
      contracts: { where: { contractType: 'internship' }, orderBy: { startDate: 'desc' }, take: 1, select: { startDate: true, endDate: true } },
    },
  });
  if (!emp) throw new HttpError(404, 'Employee not found');
  if (emp.employmentType !== 'Intern') throw new HttpError(400, 'Acceptance letters are only for interns');
  if (!emp.department) throw new HttpError(400, "Set the intern's department first");
  const contract = emp.contracts[0];
  const start = contract?.startDate ?? null;
  const end = contract?.endDate ?? null;
  if (!start || !end) throw new HttpError(400, 'Add the internship contract (start and end dates) first');

  const weeks = opts.weeks ?? Math.max(1, Math.round((end.getTime() - start.getTime()) / WEEK_MS));
  const s = await getSettings();
  const fullName = `${emp.firstName} ${emp.lastName}`;

  const pdf = await renderAcceptanceLetter({
    date: letterDate(opts.date ?? new Date()),
    fullName,
    firstName: emp.firstName,
    cpr: emp.cprNumber,
    nationality: emp.nationality,
    position: 'Intern',
    department: emp.department.name,
    startDate: longDate(start),
    endDate: longDate(end),
    duration: `${weeks} Week${weeks === 1 ? '' : 's'}`,
    signatoryName: s.ceoName,
    signatoryTitle: s.ceoTitle,
  });

  await logAudit({ actorUserId: actor.userId, action: 'employee.acceptance_letter', entity: 'Employee', entityId: employeeId, changes: { weeks }, ip: actor.ip });
  return { pdf, fileName: `Internship_Acceptance_Letter-${fullName.replace(/[^\w\- ]/g, '').replace(/\s+/g, '_')}.pdf` };
}

import prisma from '../../config/prisma';
import { notifyEmployee, notifyPermission, userIdsForEmployees, notifyUsers } from '../../utils/notify';

interface LeaveSummary {
  id: number;
  status: string;
  days: number;
  employee: { id: number; firstName: string; lastName: string; managerId: number | null };
  leaveType: { name: string };
}

const label = (r: LeaveSummary) => `${r.leaveType.name}, ${r.days} day(s)`;

async function notifyApprovers(r: LeaveSummary) {
  const who = `${r.employee.firstName} ${r.employee.lastName}`;
  if (r.status === 'pending_manager' && r.employee.managerId) {
    await notifyUsers(await userIdsForEmployees([r.employee.managerId]), {
      type: 'leave', title: `Leave request from ${who}`, body: label(r), link: `/leave/requests/${r.id}`,
    });
  } else if (r.status === 'pending_hr') {
    await notifyPermission('leave:manage', { type: 'leave', title: `Leave request awaiting HR: ${who}`, body: label(r), link: `/leave/requests/${r.id}` });
  }
}

export async function onLeaveRequested(r: LeaveSummary) {
  await notifyApprovers(r);
}

export async function onLeaveDecided(r: LeaveSummary) {
  if (r.status === 'approved' || r.status === 'rejected') {
    const last = await prisma.leaveApproval.findFirst({ where: { requestId: r.id }, orderBy: { createdAt: 'desc' } });
    await notifyEmployee(r.employee.id, {
      type: 'leave', title: `Your leave request was ${r.status}`,
      body: [label(r), last?.comment].filter(Boolean).join(' - '), link: `/my/leave/${r.id}`,
    });
  } else {
    await notifyApprovers(r); // moved from manager to HR
  }
}
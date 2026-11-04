import prisma from '../config/prisma';
import { getSettings } from '../utils/settings';
import { notifyEmployee, notifyPermission } from '../utils/notify';
import { notifyIfLive } from '../modules/announcements/announcement.service';

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function runChecks() {
  const window = Number((await getSettings()).expiryAlertDays) || 30;
  const until = new Date();
  until.setUTCDate(until.getUTCDate() + window);

  // documents expiring soon (CPR, passport, visa...)
  const docs = await prisma.document.findMany({
    where: { deletedAt: null, expiryDate: { not: null, lte: until } },
    include: { employee: { select: { firstName: true, lastName: true, status: true } } },
  });
  for (const d of docs) {
    if (d.employee.status !== 'active') continue;
    const when = day(d.expiryDate!);
    const name = `${d.employee.firstName} ${d.employee.lastName}`;
    await notifyPermission('document:view', {
      type: 'expiry', title: `Document expiring: ${d.title}`, body: `${name} - expires ${when}`,
      link: `/documents?expiringWithinDays=${window}`, dedupeKey: `expiry:document:${d.id}:${when}`,
    });
    if (d.visibleToEmployee) {
      await notifyEmployee(d.employeeId, {
        type: 'expiry', title: `Your document "${d.title}" expires on ${when}`, body: 'Please upload a renewed copy.',
        link: '/my/documents', dedupeKey: `expiry:my-document:${d.id}:${when}`,
      });
    }
  }

  // contracts ending soon
  const contracts = await prisma.contract.findMany({
    where: { status: 'active', endDate: { not: null, lte: until } },
    include: { employee: { select: { firstName: true, lastName: true } } },
  });
  for (const c of contracts) {
    const when = day(c.endDate!);
    await notifyPermission('contract:manage', {
      type: 'expiry', title: `Contract ending: ${c.employee.firstName} ${c.employee.lastName}`,
      body: `${c.contractNumber ?? `CT-${c.id}`} ends ${when}`, link: `/contracts/${c.id}`, dedupeKey: `expiry:contract:${c.id}:${when}`,
    });
  }

  // announcements whose publish time has arrived
  const due = await prisma.announcement.findMany({ where: { notified: false, publishAt: { lte: new Date() } } });
  for (const a of due) await notifyIfLive(a);
}

export function startScheduler() {
  if (process.env.DISABLE_JOBS === 'true') return;
  const run = () => runChecks().catch((err) => console.error('scheduled checks failed', err));
  setTimeout(run, 10_000);            // shortly after start-up
  setInterval(run, 60 * 60 * 1000);   // then every hour
}
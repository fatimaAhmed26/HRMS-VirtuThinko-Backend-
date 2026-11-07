// HR alerts go only to users who can see that employee's entity
import prisma from '../config/prisma';
import { getSettings } from '../utils/settings';
import { notifyEmployee, notifyPermission } from '../utils/notify';
import { notifyIfLive } from '../modules/announcements/announcement.service';

const day = (d: Date) => d.toISOString().slice(0, 10);
const todayUtc = () => new Date(day(new Date()) + 'T00:00:00Z');

// Outsourced staff: alert HR 3 months, 2 months, 1 month and 7 days before the deployment (PO) ends
const DEPLOYMENT_ALERTS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '1 month' },
  { days: 60, label: '2 months' },
  { days: 90, label: '3 months' },
];

async function deploymentAlerts() {
  const today = todayUtc();
  const last = new Date(today);
  last.setUTCDate(last.getUTCDate() + DEPLOYMENT_ALERTS[DEPLOYMENT_ALERTS.length - 1].days);
  const staff = await prisma.employee.findMany({
    where: { status: 'active', employmentType: 'Outsourced', deploymentEnd: { gte: today, lte: last } },
    select: { id: true, firstName: true, lastName: true, country: true, poNumber: true, deploymentEnd: true, clientCompany: { select: { name: true } } },
  });
  for (const e of staff) {
    const daysLeft = Math.round((e.deploymentEnd!.getTime() - today.getTime()) / 86_400_000);
    const point = DEPLOYMENT_ALERTS.find((a) => daysLeft <= a.days)!; // the closest alert point already reached
    const when = day(e.deploymentEnd!);
    await notifyPermission('contract:manage', {
      type: 'expiry',
      title: `Deployment ending in ${point.label}: ${e.firstName} ${e.lastName}`,
      body: `${e.clientCompany?.name ?? 'Client'}${e.poNumber ? ` - PO ${e.poNumber}` : ''} ends ${when} (${daysLeft} days left)`,
      link: `/employees/${e.id}`,
      dedupeKey: `deployment:${e.id}:${when}:${point.days}`, // each alert point is sent once
    }, e.country);
  }
}

export async function runChecks() {
  const window = Number((await getSettings()).expiryAlertDays) || 30;
  const until = new Date();
  until.setUTCDate(until.getUTCDate() + window);

  // documents expiring soon (CPR, passport, visa...)
  const docs = await prisma.document.findMany({
    where: { deletedAt: null, expiryDate: { not: null, lte: until } },
    include: { employee: { select: { firstName: true, lastName: true, status: true, country: true } } },
  });
  for (const d of docs) {
    if (d.employee.status !== 'active') continue;
    const when = day(d.expiryDate!);
    const name = `${d.employee.firstName} ${d.employee.lastName}`;
    await notifyPermission('document:view', {
      type: 'expiry', title: `Document expiring: ${d.title}`, body: `${name} - expires ${when}`,
      link: `/documents?expiringWithinDays=${window}`, dedupeKey: `expiry:document:${d.id}:${when}`,
    }, d.employee.country);
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
    include: { employee: { select: { firstName: true, lastName: true, country: true } } },
  });
  for (const c of contracts) {
    const when = day(c.endDate!);
    await notifyPermission('contract:manage', {
      type: 'expiry', title: `Contract ending: ${c.employee.firstName} ${c.employee.lastName}`,
      body: `${c.contractNumber ?? `CT-${c.id}`} ends ${when}`, link: `/contracts/${c.id}`, dedupeKey: `expiry:contract:${c.id}:${when}`,
    }, c.employee.country);
  }

  // outsourced deployments ending (90 / 60 / 30 / 7 days)
  await deploymentAlerts();

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
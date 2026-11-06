import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../config/prisma';
import { authenticate, requirePermission } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { detectFileType, filePath, saveFile } from '../../utils/fileStorage';
import { getSettings } from '../../utils/settings';
import { runChecks } from '../../jobs/scheduler';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const updateSchema = z.object({
  companyName: z.string().trim().min(1).max(150).optional(),
  companyAddress: z.string().trim().max(300).optional(),
  companyPhone: z.string().trim().max(30).optional(),
  companyEmail: z.union([z.string().trim().email(), z.literal('')]).optional(),
  companyWebsite: z.string().trim().max(150).optional(),
  workdayStart: time.optional(),
  workdayEnd: time.optional(),
  expiryAlertDays: z.coerce.number().int().min(1).max(180).transform(String).optional(),
  hrSignatoryName: z.string().trim().max(100).optional(),
  hrSignatoryTitle: z.string().trim().max(100).optional(),
});

const router = Router();

router.get('/public', asyncHandler(async (_req, res) => {
  const s = await getSettings();
  res.json({ companyName: s.companyName, hasLogo: Boolean(s.companyLogo) });
}));

router.get('/logo', asyncHandler(async (_req, res) => {
  const s = await getSettings();
  if (!s.companyLogo) throw new HttpError(404, 'No logo uploaded');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(filePath(s.companyLogo));
}));

router.use(authenticate);

router.get('/', asyncHandler(async (_req, res) => res.json(await getSettings())));

router.patch('/', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  const input = parse(updateSchema, req.body);
  const before = await getSettings();
  const entries = Object.entries(input).filter(([, v]) => v !== undefined) as [string, string][];
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of entries) {
      await tx.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
    await logAudit({
      actorUserId: req.user!.id, action: 'settings.update', entity: 'Setting', entityId: 'company',
      changes: Object.fromEntries(entries.map(([k, v]) => [k, { from: before[k] ?? null, to: v }])), ip: req.ip ?? null,
    }, tx);
  });
  res.json(await getSettings());
}));

router.post('/logo', requirePermission('settings:manage'), uploadSingle, asyncHandler(async (req, res) => {
  const type = detectFileType(req.file!.buffer);
  if (type.mime === 'application/pdf') throw new HttpError(400, 'The logo must be a PNG or JPEG image');
  const storedName = await saveFile(req.file!.buffer, type.ext);
  await prisma.setting.upsert({ where: { key: 'companyLogo' }, update: { value: storedName }, create: { key: 'companyLogo', value: storedName } });
  await logAudit({ actorUserId: req.user!.id, action: 'settings.logo', entity: 'Setting', entityId: 'companyLogo', ip: req.ip ?? null });
  res.status(201).json({ ok: true });
}));
// Run the hourly checks now (expiry and deployment alerts, scheduled announcements)  for admins and demos
router.post('/run-checks', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  await runChecks();
  await logAudit({ actorUserId: req.user!.id, action: 'settings.run_checks', entity: 'Setting', entityId: 'scheduler', ip: req.ip ?? null });
  res.json({ ok: true });
}));
export default router;
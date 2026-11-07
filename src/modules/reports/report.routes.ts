import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { getCompany } from '../../utils/settings';
import { REPORTS, reportQuerySchema } from './report.definitions';
import { toExcel, toPdf } from './report.render';
import { assertCountry, entitiesOf } from '../../utils/scope';

const router = Router();
router.use(authenticate, requirePermission('report:view'));

router.get('/', (req, res) => {
  const perms = req.user!.permissions;
  res.json(
    Object.entries(REPORTS)
      .filter(([, r]) => r.permissions.every((p) => perms.includes(p)))
      .map(([key, r]) => ({ key, title: r.title, description: r.description, canExport: perms.includes('report:export') }))
  );
});

router.get('/:name', asyncHandler(async (req, res) => {
  const def = REPORTS[String(req.params.name)];
  if (!def) throw new HttpError(404, 'Report not found');
  const perms = req.user!.permissions;
  if (!def.permissions.every((p) => perms.includes(p))) throw new HttpError(403, 'You do not have permission for this report');

  const q = parse(reportQuerySchema, req.query);
      const entities = await entitiesOf(req.user!);
    if (q.country) await assertCountry(req.user!, q.country);
    else if (entities.length === 1) q.country = entities[0] as 'BH' | 'SA';
  const result = await def.build(q);
  if (q.format === 'json') {
    res.json(result);
    return;
  }

  if (!perms.includes('report:export')) throw new HttpError(403, 'You do not have permission to export reports');
  const company = await getCompany();
  const file = q.format === 'xlsx' ? await toExcel(result, company) : await toPdf(result, company);
  await logAudit({ actorUserId: req.user!.id, action: 'report.export', entity: 'Report', entityId: String(req.params.name),
    changes: { format: q.format, rows: result.rows.length, filters: req.query as Record<string, string> }, ip: req.ip ?? null });

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', q.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
  res.setHeader('Cache-Control', 'private, no-store');
  res.attachment(`${req.params.name}-${stamp}.${q.format}`);
  res.send(file);
}));

export default router;
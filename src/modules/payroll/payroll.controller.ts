import { Request } from 'express';
import * as service from './payroll.service';
import { writePayslipPdf } from './payslip.pdf';
import {
  commentSchema, createItemSchema, createItemTypeSchema, createRunSchema, listItemsQuerySchema, listRunsQuerySchema, stopItemSchema,
} from './payroll.schema';
import { asyncHandler } from '../../utils/asyncHandler';
import { parse } from '../../utils/validate';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../../utils/audit';
import { getCompany } from '../../utils/settings';
import { assertCountry, assertEmployee, employeeScope, entitiesOf } from '../../utils/scope';

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}
const ip = (req: Request) => req.ip ?? null;

// runs (one per entity per month: ?entity=BH|SA&period=2026-11) - only the user's entities
export const listRuns = asyncHandler(async (req, res) => {
  const q = parse(listRunsQuerySchema, req.query);
  if (q.entity) await assertCountry(req.user!, q.entity);
  res.json(await service.listRuns(q, await entitiesOf(req.user!)));
});
export const getRun = asyncHandler(async (req, res) => res.json(await service.getRun(idParam(req))));

export const createRun = asyncHandler(async (req, res) => {
  const { period, entity } = parse(createRunSchema, req.body);
  await assertCountry(req.user!, entity);
  res.status(201).json(await service.createRun(period, entity, req.user!, ip(req)));
});

export const recalculate = asyncHandler(async (req, res) => {
  res.json(await service.recalculate(idParam(req), req.user!, ip(req)));
});

export const transition = (action: service.RunAction) =>
  asyncHandler(async (req, res) => {
    const { comment } = parse(commentSchema, req.body ?? {});
    res.json(await service.transition(idParam(req), action, comment, req.user!, ip(req)));
  });

export const deleteRun = asyncHandler(async (req, res) => {
  await service.deleteRun(idParam(req), req.user!, ip(req));
  res.status(204).end();
});

export const bankFile = asyncHandler(async (req, res) => {
  const file = await service.bankFile(idParam(req), req.user!, ip(req));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.attachment(file.filename);
  res.send(file.content);
});

// payslips (HR and payroll only - the routes require payroll:view)
export const getPayslip = asyncHandler(async (req, res) => res.json(await service.getPayslip(idParam(req))));

export const payslipPdf = asyncHandler(async (req, res) => {
  const slip = await service.getPayslip(idParam(req));
  await logAudit({ actorUserId: req.user!.id, action: 'payslip.download', entity: 'Payslip', entityId: slip.id, ip: ip(req) });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'private, no-store');
  res.attachment(`payslip-${slip.run.period}-${slip.employeeCode}.pdf`);
  writePayslipPdf(
    {
      company: await getCompany(),
      period: slip.run.period,
      employeeCode: slip.employeeCode,
      employeeName: slip.employeeName,
      department: slip.department,
      jobTitle: slip.jobTitle,
      currency: slip.currency,
      earnings: slip.earnings as never,
      deductions: slip.deductions as never,
      grossSalary: slip.grossSalary.toFixed(),
      totalDeductions: slip.totalDeductions.toFixed(),
      netSalary: slip.netSalary.toFixed(),
      generatedAt: new Date(),
    },
    res
  );
});

// allowance / deduction categories and entries
export const listItemTypes = asyncHandler(async (_req, res) => res.json(await service.listItemTypes()));
export const createItemType = asyncHandler(async (req, res) => {
  res.status(201).json(await service.createItemType(parse(createItemTypeSchema, req.body), req.user!, ip(req)));
});

export const listItems = asyncHandler(async (req, res) => {
  res.json(await service.listItems(parse(listItemsQuerySchema, req.query), await employeeScope(req.user!)));
});
export const createItem = asyncHandler(async (req, res) => {
  const input = parse(createItemSchema, req.body);
  await assertEmployee(req.user!, input.employeeId);
  res.status(201).json(await service.createItem(input, req.user!, ip(req)));
});
export const approveItem = asyncHandler(async (req, res) => res.json(await service.decideItem(idParam(req), 'approved', req.user!, ip(req))));
export const rejectItem = asyncHandler(async (req, res) => res.json(await service.decideItem(idParam(req), 'rejected', req.user!, ip(req))));
export const stopItem = asyncHandler(async (req, res) => {
  const { toPeriod } = parse(stopItemSchema, req.body);
  res.json(await service.stopItem(idParam(req), toPeriod, req.user!, ip(req)));
});
export const deleteItem = asyncHandler(async (req, res) => {
  await service.deleteItem(idParam(req), req.user!, ip(req));
  res.status(204).end();
});
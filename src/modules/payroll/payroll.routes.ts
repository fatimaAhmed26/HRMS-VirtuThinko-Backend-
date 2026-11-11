import { Router } from 'express';
import * as c from './payroll.controller';
import * as service from './payroll.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { HttpError } from '../../utils/httpError';
import { authenticate, requirePermission } from '../../middleware/auth';
import prisma from '../../config/prisma';
import { assertCountry, assertEmployee } from '../../utils/scope';

const router = Router();
router.use(authenticate);

 router.param('id', (req, _res, next, value) => {
    const id = Number(value);
    if (!req.user || !Number.isInteger(id) || id <= 0) return next();
    const check = async () => {
      if (req.path.startsWith('/runs/')) {
        const run = await prisma.payrollRun.findUnique({ where: { id }, select: { entity: true } });
        if (run) await assertCountry(req.user!, run.entity);
      } else if (req.path.startsWith('/payslips/')) {
        const slip = await prisma.payslip.findUnique({ where: { id }, select: { country: true } });
        if (slip) await assertCountry(req.user!, slip.country);
      } else if (req.path.startsWith('/items/')) {
        const item = await prisma.payItem.findUnique({ where: { id }, select: { employeeId: true } });
        if (item) await assertEmployee(req.user!, item.employeeId);
      }
    };
    check().then(() => next(), next);
  });

// payslips - HR and payroll only (employees do not see payroll in this system)
router.get('/payslips', requirePermission('payroll:view'), asyncHandler(async (req, res) => {
  const employeeId = Number(req.query.employeeId);
  if (!Number.isInteger(employeeId) || employeeId <= 0) throw new HttpError(400, 'employeeId is required');
  await assertEmployee(req.user!, employeeId);
  res.json(await service.employeePayslips(employeeId));
}));
router.get('/payslips/:id', requirePermission('payroll:view'), c.getPayslip);
router.get('/payslips/:id/pdf', requirePermission('payroll:view'), c.payslipPdf);
// payroll runs
router.get('/runs', requirePermission('payroll:view'), c.listRuns);
router.post('/runs', requirePermission('payroll:create'), c.createRun);
router.get('/runs/:id', requirePermission('payroll:view'), c.getRun);
router.post('/runs/:id/recalculate', requirePermission('payroll:edit'), c.recalculate);
router.post('/runs/:id/submit', requirePermission('payroll:edit'), c.transition('submit'));
router.post('/runs/:id/approve', requirePermission('payroll:approve'), c.transition('approve'));
router.post('/runs/:id/return', requirePermission('payroll:approve'), c.transition('return'));
router.post('/runs/:id/process', requirePermission('payroll:process'), c.transition('process'));
router.post('/runs/:id/pay', requirePermission('payroll:process'), c.transition('pay'));
router.get('/runs/:id/bank-file', requirePermission('payroll:process'), c.bankFile);
router.delete('/runs/:id', requirePermission('payroll:edit'), c.deleteRun);

// allowance & deduction categories
router.get('/item-types', requirePermission('payroll:view'), c.listItemTypes);
router.post('/item-types', requirePermission('payroll:edit'), c.createItemType);

// allowances & deductions per employee
router.get('/items', requirePermission('payroll:view'), c.listItems);
router.post('/items', requirePermission('payroll:create'), c.createItem);
router.post('/items/:id/approve', requirePermission('payroll:approve'), c.approveItem);
router.post('/items/:id/reject', requirePermission('payroll:approve'), c.rejectItem);
router.patch('/items/:id/stop', requirePermission('payroll:edit'), c.stopItem);
router.delete('/items/:id', requirePermission('payroll:edit'), c.deleteItem);

export default router;
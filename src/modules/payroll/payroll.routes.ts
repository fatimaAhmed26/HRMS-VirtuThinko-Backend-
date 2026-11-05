import { Router } from 'express';
import * as c from './payroll.controller';
import { authenticate, requirePermission } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

// payslips - HR and payroll only (employees do not see payroll in this system)
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
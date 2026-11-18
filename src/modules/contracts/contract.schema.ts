import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').transform((s) => new Date(`${s}T00:00:00.000Z`));
const money = z.coerce.number().min(0).max(1_000_000).multipleOf(0.001, 'At most 3 decimals');

// Extra components of the salary package: allowances, deductions (e.g. loan repayment) and yearly bonuses.
// Basic salary, housing and transport are their own fields; social insurance is calculated by payroll.
export const salaryItemSchema = z
  .object({
    kind: z.enum(['allowance', 'deduction', 'bonus']),
    label: z.string().trim().min(1, 'Name each component').max(80),
    amount: money.refine((v) => v > 0, 'Enter an amount for each component'),
    paid: z.enum(['monthly', 'yearly']),
  })
  .refine((i) => i.kind !== 'bonus' || i.paid === 'yearly', { message: 'Bonuses are paid yearly or on approval', path: ['paid'] });

export type SalaryItem = z.infer<typeof salaryItemSchema>;

// Stored in contracts.terms (JSON)
export interface ContractTerms {
  employingEntity: string;
  probationMonths: number;
  noticeDays: number;
  annualLeaveDays: number;
  items: SalaryItem[];
}

export const createContractSchema = z
  .object({
    employeeId: z.number().int().positive(),
    contractType: z.enum(['unlimited', 'limited', 'internship']), // internship = intern stipend (basicSalary)
    title: z.string().trim().min(1).max(150).optional(),           // English title; defaults from the type
    employingEntity: z.string().trim().min(1).max(100).optional(), // defaults to the company name in Settings
    jobTitle: z.string().trim().max(100).optional(),
    startDate: isoDate,
    endDate: isoDate.optional(),
    basicSalary: money.refine((v) => v > 0, 'Basic salary is required'),
    housingAllowance: money.default(0),
    transportAllowance: money.default(0),
    weeklyHours: z.number().int().min(1).max(60).optional(),
    probationMonths: z.number().int().min(0).max(6).default(3),
    noticeDays: z.number().int().min(0).max(90).default(30),
    annualLeaveDays: z.number().int().min(0).max(60).default(30),
    items: z.array(salaryItemSchema).max(20).default([]),
    documentId: z.number().int().positive().optional(), // signed contract uploaded via /api/documents
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.contractType === 'unlimited' || v.endDate, { message: 'Limited and internship contracts need an end date', path: ['endDate'] })
  .refine((v) => !v.endDate || v.endDate > v.startDate, { message: 'End date must be after start date', path: ['endDate'] });

export const terminateSchema = z.object({
  reason: z.string({ error: 'A reason is required' }).trim().min(1, 'A reason is required').max(500),
});

export const listQuerySchema = z.object({
  employeeId: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'expiring_soon', 'renewed', 'expired', 'terminated']).optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(365).optional(),
  state: z.enum(['Active', 'Inactive', 'Ended']).optional(), // the prototype's three contract states
});

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type ListContractsQuery = z.infer<typeof listQuerySchema>;

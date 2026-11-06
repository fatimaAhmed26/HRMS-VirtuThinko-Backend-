import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').transform((s) => new Date(`${s}T00:00:00.000Z`));
const money = z.coerce.number().min(0).max(1_000_000).multipleOf(0.001, 'At most 3 decimals');

export const createContractSchema = z
  .object({
    employeeId: z.number().int().positive(),
    contractType: z.enum(['unlimited', 'limited', 'internship']), // internship = intern stipend (basicSalary)
    jobTitle: z.string().trim().max(100).optional(),
    startDate: isoDate,
    endDate: isoDate.optional(),
    basicSalary: money.refine((v) => v > 0, 'Basic salary is required'),
    housingAllowance: money.default(0),
    transportAllowance: money.default(0),
    weeklyHours: z.number().int().min(1).max(60).optional(),
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
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').transform((s) => new Date(`${s}T00:00:00.000Z`));

export const createRequestSchema = z
  .object({
    leaveTypeId: z.number().int().positive(),
    startDate: isoDate,
    endDate: isoDate,
    reason: z.string().trim().max(500).optional(),
    attachmentUrl: z.string().trim().max(255).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'End date must be on or after start date', path: ['endDate'] });

export const decisionSchema = z.object({
  comment: z.string().trim().max(500).optional(),
});

export const rejectSchema = z.object({
  comment: z.string({ error: 'A reason is required when rejecting' }).trim().min(1, 'A reason is required when rejecting').max(500),
});

export const listQuerySchema = z.object({
  status: z.enum(['pending_manager', 'pending_hr', 'approved', 'rejected', 'cancelled']).optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  leaveTypeId: z.coerce.number().int().positive().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const typesQuerySchema = z.object({
  country: z.enum(['BH', 'SA']).optional(),
});

const tierSchema = z.object({ days: z.number().int().positive(), payPercent: z.number().min(0).max(100) });

export const updateTypeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(255).nullable().optional(),
  days: z.number().int().positive().optional(),
  daysAfterYears: z.number().int().positive().nullable().optional(),
  daysAfter: z.number().int().positive().nullable().optional(),
  payTiers: z.array(tierSchema).nullable().optional(),
  minServiceMonths: z.number().int().min(0).optional(),
  requiresAttachment: z.boolean().optional(),
  countWorkingDays: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const holidaySchema = z.object({
  country: z.enum(['BH', 'SA']),
  date: isoDate,
  name: z.string().trim().min(1).max(100),
});

export const holidaysQuerySchema = z.object({
  country: z.enum(['BH', 'SA']).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ListRequestsQuery = z.infer<typeof listQuerySchema>;
export type UpdateTypeInput = z.infer<typeof updateTypeSchema>;
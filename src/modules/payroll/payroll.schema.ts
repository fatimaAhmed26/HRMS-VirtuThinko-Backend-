import { z } from 'zod';

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM, e.g. 2026-11');
const money = z.coerce.number().positive().max(1_000_000).multipleOf(0.001, 'At most 3 decimals');

const ENTITIES = ['BH', 'SA'] as const; // VirtuThinko Bahrain / VirtuThinko Saudi separate payroll runs

export const createRunSchema = z.object({
  period: periodSchema,
  entity: z.enum(ENTITIES, { error: 'entity must be BH or SA' }),
});

export const listRunsQuerySchema = z.object({
  entity: z.enum(ENTITIES).optional(),
  period: periodSchema.optional(),
});

export const commentSchema = z.object({ comment: z.string().trim().max(500).optional() });

export const createItemTypeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/, 'Use letters, numbers and _'),
  name: z.string().trim().min(1).max(100),
  kind: z.enum(['earning', 'deduction']),
  contributory: z.boolean().optional(),
});

export const createItemSchema = z
  .object({
    employeeId: z.number().int().positive(),
    typeId: z.number().int().positive(),
    amount: money,
    recurring: z.boolean().default(false),
    fromPeriod: periodSchema,
    toPeriod: periodSchema.optional(), // recurring only empty = until stopped
    reason: z.string().trim().max(255).optional(),
  })
  .refine((v) => !v.toPeriod || v.toPeriod >= v.fromPeriod, { message: 'toPeriod must be after fromPeriod', path: ['toPeriod'] });

export const stopItemSchema = z.object({ toPeriod: periodSchema });

export const listItemsQuerySchema = z.object({
  employeeId: z.coerce.number().int().positive().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  period: periodSchema.optional(),
});

export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type CreateItemTypeInput = z.infer<typeof createItemTypeSchema>;
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
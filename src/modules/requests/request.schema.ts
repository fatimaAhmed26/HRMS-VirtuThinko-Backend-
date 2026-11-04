import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').transform((s) => new Date(`${s}T00:00:00.000Z`));

export const STATUSES = ['pending', 'in_progress', 'approved', 'rejected', 'completed', 'cancelled'] as const;

export const createRequestSchema = z.object({
  typeId: z.number().int().positive(),
  purpose: z.string().trim().min(3, 'Please state the purpose').max(255),
  details: z.string().trim().max(2000).optional(),
  addressedTo: z.string().trim().max(150).optional(),  // e.g. "Ministry of Interior", "BBK"
  attachmentId: z.number().int().positive().optional(), // uploaded via /api/documents (category request_attachment)
});

export const commentSchema = z.object({ comment: z.string().trim().max(500).optional() });
export const rejectSchema = z.object({
  comment: z.string({ error: 'A reason is required when rejecting' }).trim().min(1, 'A reason is required when rejecting').max(500),
});
export const completeSchema = z.object({
  documentId: z.number().int().positive().optional(), // general requests: a file HR uploaded for the employee
  comment: z.string().trim().max(500).optional(),
});

export const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  typeId: z.coerce.number().int().positive().optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateTypeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(255).nullable().optional(),
  template: z.string().trim().max(10000).nullable().optional(),
  requiresAttachment: z.boolean().optional(),
  active: z.boolean().optional(),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ListRequestsQuery = z.infer<typeof listQuerySchema>;
export type UpdateTypeInput = z.infer<typeof updateTypeSchema>;
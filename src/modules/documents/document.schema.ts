import { z } from 'zod';

export const CATEGORIES = ['leave_attachment', 'request_attachment', 'id_copy', 'certificate', 'contract', 'personal', 'other'] as const;

// Categories an employee may upload for themselves; the rest are HR-only
export const SELF_CATEGORIES: readonly string[] = ['leave_attachment', 'request_attachment', 'personal'];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').transform((s) => new Date(`${s}T00:00:00.000Z`));

// multipart form fields arrive as strings
export const uploadSchema = z.object({
  employeeId: z.coerce.number().int().positive().optional(), // default: your own employee record
  category: z.enum(CATEGORIES),
  title: z.string().trim().min(1).max(150).optional(),       // default: the file name
  expiryDate: isoDate.optional(),
  visibleToEmployee: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const listQuerySchema = z.object({
  employeeId: z.coerce.number().int().positive().optional(),
  category: z.enum(CATEGORIES).optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(365).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type UploadInput = z.infer<typeof uploadSchema>;
export type ListDocumentsQuery = z.infer<typeof listQuerySchema>;
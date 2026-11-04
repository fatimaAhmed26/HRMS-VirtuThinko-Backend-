import { z } from 'zod';

const dateTime = z.coerce.date(); 

export const announcementSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(150),
    body: z.string().trim().min(1, 'Content is required').max(10000),
    priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
    pinned: z.boolean().default(false),
    audience: z.enum(['all', 'departments', 'employees']).default('all'),
    departmentIds: z.array(z.number().int().positive()).optional(),
    employeeIds: z.array(z.number().int().positive()).optional(),
    publishAt: dateTime.optional(), 
    expiresAt: dateTime.optional(),
  })
  .refine((v) => !v.expiresAt || !v.publishAt || v.expiresAt > v.publishAt, { message: 'Expiry must be after the publish date', path: ['expiresAt'] });

export const updateAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  body: z.string().trim().min(1).max(10000).optional(),
  priority: z.enum(['normal', 'important', 'urgent']).optional(),
  pinned: z.boolean().optional(),
  audience: z.enum(['all', 'departments', 'employees']).optional(),
  departmentIds: z.array(z.number().int().positive()).optional(),
  employeeIds: z.array(z.number().int().positive()).optional(),
  publishAt: dateTime.optional(),
  expiresAt: dateTime.nullable().optional(),
});

export type AnnouncementInput = z.infer<typeof announcementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
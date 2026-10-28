import { z } from 'zod';
import { passwordSchema } from '../../utils/password';

const roleIds = z.array(z.number().int().positive()).min(1, 'Assign at least one role');

export const createUserSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username can only contain letters, numbers, . _ -'),
  email: z.string().trim().toLowerCase().email('Invalid email').max(100).optional(), // defaults to the employee's email
  password: passwordSchema.optional(),          // if empty, a temporary password is generated
  employeeId: z.number().int().positive().optional().nullable(),
  roleIds,
});

export const updateUserSchema = z.object({
  username: createUserSchema.shape.username.optional(),
  email: z.string().trim().toLowerCase().email('Invalid email').max(100).optional(),
  employeeId: z.number().int().positive().nullable().optional(), // null = unlink
});

export const rolesSchema = z.object({ roleIds });

export const statusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema.optional(), // if empty, a temporary password is generated
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const listQuerySchema = z.object({
  search: z.string().trim().optional(), // username, email, employee name
  status: z.enum(['active', 'inactive']).optional(),
  roleId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listQuerySchema>;
import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max).optional().nullable();
const date = z.coerce.date().optional().nullable(); // accepts "2026-01-15"
const id = z.number().int().positive().optional().nullable();

export const createEmployeeSchema = z.object({
  employeeCode: z.string().trim().max(20).optional(), // auto-generated (VT-0001) if empty

  // personal
  firstName: z.string().trim().min(1, 'First name is required').max(50),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  email: z.string().trim().toLowerCase().email('Invalid email').max(100),
  phone: text(20),
  address: text(255),
  gender: z.enum(['Male', 'Female']).optional().nullable(),
  birthDate: date,
  nationality: text(50),
  cprNumber: z.string().trim().regex(/^\d{9}$/, 'CPR must be 9 digits').optional().nullable(),
  photoUrl: text(255),

  // employment
  departmentId: id,
  jobTitle: text(100),
  managerId: id,
  employmentType: z.enum(['Full-time', 'Part-time', 'Contract', 'Intern']).optional().nullable(),
  workLocation: text(100),
  country: z.enum(['BH', 'SA']).optional(),
  hireDate: date,
  probationEnd: date,

  // bank (encrypted before saving)
  bankName: text(100),
  bankAccountNumber: z.string().trim().max(34).optional().nullable(), // IBAN max 34

  // emergency contact
  emergencyName: text(100),
  emergencyPhone: text(20),
});

// Every field optional on edit; status is changed only through /status
export const updateEmployeeSchema = createEmployeeSchema.partial();

export const statusSchema = z.object({
  status: z.enum(['active', 'inactive']),
  reason: z.string().trim().max(255).optional(),
});

export const listQuerySchema = z.object({
  search: z.string().trim().optional(),          // name, code, email, job title, department
  departmentId: z.coerce.number().int().positive().optional(),
  jobTitle: z.string().trim().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listQuerySchema>;
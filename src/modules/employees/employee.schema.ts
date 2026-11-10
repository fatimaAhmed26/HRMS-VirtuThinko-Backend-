import { z } from 'zod';

// Interns have no portal login; Outsourced staff work at a client company
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Fixed-term', 'Contractor', 'Intern', 'Outsourced', 'Other'] as const;

const text = (max: number) => z.string().trim().max(max).optional().nullable();
const date = z.coerce.date().optional().nullable(); // accepts "2026-01-15"
const id = z.number().int().positive().optional().nullable();

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

const dependantSchema = z.object({
  fullName: z.string().trim().min(1, 'Dependant name is required').max(150),
  relationship: z.enum(['Spouse', 'Son', 'Daughter', 'Parent', 'Other']),
  birthDate: date,
  nationality: text(50),
  idNumber: text(30),
});

const qualificationSchema = z.object({
  kind: z.enum(['education', 'certification']),
  title: z.string().trim().min(1, 'Qualification title is required').max(150),
  institution: text(150),
  country: text(50),
  year: z.number().int().min(1950).max(2100).optional().nullable(),
  grade: text(20),
  obtainedDate: date,
  expiryDate: date,
});

const previousEmploymentSchema = z.object({
  employerName: z.string().trim().min(1, 'Employer name is required').max(150),
  jobTitle: text(100),
  fromDate: date,
  toDate: date,
  reasonForLeaving: text(255),
  refName: text(100),
  refJobTitle: text(100),
  refPhone: text(20),
  refEmail: z.string().trim().toLowerCase().email('Invalid reference email').max(100).optional().nullable(),
});

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
  cprNumber: z.string().trim().regex(/^\d{9,10}$/, 'ID must be 9 digits (CPR) or 10 digits (Saudi ID / Iqama)').optional().nullable(),
  photoUrl: text(255),

  // employment
  departmentId: id,
  jobTitle: text(100),
  managerId: id,
  employmentType: z.enum(EMPLOYMENT_TYPES).optional().nullable(),
  workLocation: text(100),
  country: z.enum(['BH', 'SA']).optional(), // which labour law applies (default BH)
  isNational: z.boolean().optional(),       // Bahraini (BH) / Saudi (SA) -> pension contributions
  siNewScheme: z.boolean().optional(),      // Saudi: first GOSI registration on/after 3 July 2024
  hireDate: date,
  probationEnd: date,

  // bank (encrypted before saving)
  bankName: text(100),
  bankAccountNumber: z.string().trim().max(34).optional().nullable(), // IBAN max 34

  // outsourced staff
  clientCompanyId: id,
  clientSupervisor: text(150),
  poNumber: text(50),
  deploymentStart: date,
  deploymentEnd: date,

  // emergency contact
  emergencyName: text(100),
  emergencyPhone: text(20),

  // ── onboarding form VTHR-ONB-F01 ──
  fullNamePassport: text(150),
  fullNameId: text(150),
  fullNameArabic: text(150),
  placeOfBirth: text(100),
  otherNationality: text(50),
  maritalStatus: z.enum(['Single', 'Married', 'Divorced', 'Widowed']).optional().nullable(),
  childrenCount: z.number().int().min(0).max(30).optional().nullable(),

  idExpiry: date,
  passportNumber: text(30),
  passportPlaceOfIssue: text(100),
  passportIssueDate: date,
  passportExpiry: date,
  permitNumber: text(30),
  permitExpiry: date,
  socialInsuranceNumber: text(30),
  drivingLicenceNumber: text(30),

  addressFlat: text(20),
  addressBuilding: text(20),
  addressRoad: text(50),
  addressBlock: text(20),
  addressCity: text(100),
  addressCountry: text(50),
  homeCountryAddress: text(255),
  altPhone: text(20),
  personalEmail: z.string().trim().toLowerCase().email('Invalid personal email').max(100).optional().nullable(),

  emergencyRelationship: text(50),
  emergencyAltPhone: text(20),
  emergencyAddress: text(255),
  emergency2Name: text(100),
  emergency2Relationship: text(50),
  emergency2Phone: text(20),
  emergency2AltPhone: text(20),
  emergency2Address: text(255),

  languages: text(255),
  mayContactEmployers: z.boolean().optional().nullable(),
  hasRestrictiveClauses: z.boolean().optional().nullable(),

  // medical (encrypted before saving, HR with employee:edit only)
  hasMedicalCondition: z.boolean().optional().nullable(),
  medicalDetails: text(2000),
  bloodGroup: z.enum(BLOOD_GROUPS).optional().nullable(),
  regularMedication: text(1000),

  bankBranch: text(100),
  bankAccountHolder: text(150),

  documentChecklist: z
    .record(z.string().max(40), z.object({ na: z.boolean().optional(), received: z.boolean().optional() }))
    .refine((v) => Object.keys(v).length <= 30, 'Too many checklist items')
    .optional()
    .nullable(),

  declarationAccepted: z.boolean().optional(),
  declarationName: text(150),
  declarationDate: date,
  declarationPlace: text(100),

  verifiedAt: date, // verifiedByUserId is always the HR user saving the form
  hrRemarks: text(500),

  // repeating sections: sent in full, replace what was saved before
  dependants: z.array(dependantSchema).max(20).optional(),
  qualifications: z.array(qualificationSchema).max(30).optional(),
  previousEmployments: z.array(previousEmploymentSchema).max(10).optional(),
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
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(), // e.g. ?employmentType=Intern for the Interns page
  clientCompanyId: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Fields an employee may change on their own profile (everything else is HR-only)
export const updateMeSchema = z.object({
  phone: text(20),
  address: text(255),
  emergencyName: text(100),
  emergencyPhone: text(20),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listQuerySchema>;
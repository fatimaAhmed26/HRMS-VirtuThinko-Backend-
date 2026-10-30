// Statutory leave types per country. HR can edit them later via PATCH /api/leave/types/:id
// BH = Bahrain Labour Law 36/2012, SA = Saudi Labour Law (after Feb 2025 amendments)
type Tier = { days: number; payPercent: number };

export interface LeaveTypeSeed {
  country: 'BH' | 'SA';
  code: string;
  name: string;
  description?: string;
  allowance: 'yearly' | 'per_event';
  days: number;
  daysAfterYears?: number;
  daysAfter?: number;
  accrueFirstYear?: boolean;
  payTiers?: Tier[];
  minServiceMonths?: number;
  gender?: 'Male' | 'Female';
  oncePerEmployment?: boolean;
  requiresAttachment?: boolean;
  countWorkingDays?: boolean;
}

export const LEAVE_TYPES: LeaveTypeSeed[] = [
  // ───── Bahrain ─────
  { country: 'BH', code: 'ANNUAL', name: 'Annual Leave', allowance: 'yearly', days: 30, accrueFirstYear: true,
    description: '30 days per year; accrues 2.5 days per month during the first year' },
  { country: 'BH', code: 'SICK', name: 'Sick Leave', allowance: 'yearly', days: 55, minServiceMonths: 3, requiresAttachment: true,
    payTiers: [{ days: 15, payPercent: 100 }, { days: 20, payPercent: 50 }, { days: 20, payPercent: 0 }],
    description: '15 days full pay, 20 days half pay, 20 days unpaid; medical certificate required' },
  { country: 'BH', code: 'MATERNITY', name: 'Maternity Leave', allowance: 'per_event', days: 75, gender: 'Female', requiresAttachment: true,
    payTiers: [{ days: 60, payPercent: 100 }, { days: 15, payPercent: 0 }],
    description: '60 days paid + 15 days unpaid' },
  { country: 'BH', code: 'PATERNITY', name: 'Paternity Leave', allowance: 'per_event', days: 1, gender: 'Male',
    description: '1 paid day on the birth of a child' },
  { country: 'BH', code: 'MARRIAGE', name: 'Marriage Leave', allowance: 'per_event', days: 3, oncePerEmployment: true,
    description: '3 paid days, once' },
  { country: 'BH', code: 'BEREAVEMENT', name: 'Bereavement Leave', allowance: 'per_event', days: 3,
    description: '3 paid days for death of a relative' },
  { country: 'BH', code: 'IDDAH', name: 'Iddah Leave', allowance: 'per_event', days: 130, gender: 'Female', requiresAttachment: true,
    payTiers: [{ days: 30, payPercent: 100 }, { days: 100, payPercent: 0 }],
    description: '3 months 10 days on death of husband; first month paid' },
  { country: 'BH', code: 'HAJJ', name: 'Hajj Leave', allowance: 'per_event', days: 14, oncePerEmployment: true, minServiceMonths: 60,
    description: 'Once during employment - confirm days and service rule with HR' },
  { country: 'BH', code: 'UNPAID', name: 'Unpaid Leave', allowance: 'per_event', days: 30,
    payTiers: [{ days: 30, payPercent: 0 }], description: 'By agreement with the employer' },

  // ───── Saudi Arabia ─────
  { country: 'SA', code: 'ANNUAL', name: 'Annual Leave', allowance: 'yearly', days: 21, daysAfterYears: 5, daysAfter: 30, countWorkingDays: true,
    description: '21 days per year; 30 days after 5 years of service' },
  { country: 'SA', code: 'SICK', name: 'Sick Leave', allowance: 'yearly', days: 120, requiresAttachment: true,
    payTiers: [{ days: 30, payPercent: 100 }, { days: 60, payPercent: 75 }, { days: 30, payPercent: 0 }],
    description: '30 days full pay, 60 days at 75%, 30 days unpaid; medical certificate required' },
  { country: 'SA', code: 'MATERNITY', name: 'Maternity Leave', allowance: 'per_event', days: 84, gender: 'Female', requiresAttachment: true,
    description: '12 weeks fully paid; at least 6 weeks after birth' },
  { country: 'SA', code: 'PATERNITY', name: 'Paternity Leave', allowance: 'per_event', days: 3, gender: 'Male',
    description: '3 paid days within 7 days of the birth' },
  { country: 'SA', code: 'MARRIAGE', name: 'Marriage Leave', allowance: 'per_event', days: 5,
    description: '5 paid days' },
  { country: 'SA', code: 'BEREAVEMENT', name: 'Bereavement Leave', allowance: 'per_event', days: 5,
    description: '5 days for spouse, parent or child; 3 days for a sibling' },
  { country: 'SA', code: 'IDDAH', name: 'Iddah Leave', allowance: 'per_event', days: 130, gender: 'Female', requiresAttachment: true,
    description: '4 months 10 days paid on death of husband (15 days for non-Muslim employees)' },
  { country: 'SA', code: 'HAJJ', name: 'Hajj Leave', allowance: 'per_event', days: 15, oncePerEmployment: true, minServiceMonths: 24,
    description: '10-15 days including Eid al-Adha, once, after 2 years of service' },
  { country: 'SA', code: 'EXAM', name: 'Exam Leave', allowance: 'per_event', days: 10, requiresAttachment: true,
    description: 'Paid for actual exam days in a non-repeated year; 15 days notice' },
  { country: 'SA', code: 'UNPAID', name: 'Unpaid Leave', allowance: 'per_event', days: 20,
    payTiers: [{ days: 20, payPercent: 0 }], description: 'By agreement; over 20 days suspends the contract' },
];
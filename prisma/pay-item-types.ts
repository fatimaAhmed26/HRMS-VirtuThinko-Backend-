// Allowance & deduction categories (requirements section 14). HR can add more via POST /api/payroll/item-types
export const PAY_ITEM_TYPES = [
  // earnings
  { code: 'OTHER_ALLOWANCE', name: 'Other allowance', kind: 'earning', contributory: false },
  { code: 'FIXED_ALLOWANCE', name: 'Fixed allowance (counts for social insurance)', kind: 'earning', contributory: true },
  { code: 'BONUS', name: 'Bonus', kind: 'earning', contributory: false },
  { code: 'OVERTIME', name: 'Overtime', kind: 'earning', contributory: false },
  // deductions
  { code: 'ABSENCE', name: 'Absence', kind: 'deduction', contributory: false },
  { code: 'LATENESS', name: 'Lateness', kind: 'deduction', contributory: false },
  { code: 'LOAN', name: 'Loan repayment', kind: 'deduction', contributory: false },
  { code: 'ADVANCE', name: 'Salary advance', kind: 'deduction', contributory: false },
  { code: 'SICK_LEAVE_ADJ', name: 'Sick leave pay adjustment', kind: 'deduction', contributory: false },
  { code: 'OTHER_DEDUCTION', name: 'Other deduction', kind: 'deduction', contributory: false },
] as const;
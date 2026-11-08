const SALARY_LINES = `Basic salary: {{basicSalary}} {{currency}}
Housing allowance: {{housingAllowance}} {{currency}}
Transportation allowance: {{transportAllowance}} {{currency}}
Total monthly salary: {{totalSalary}} {{currency}}`;

export const REQUEST_TYPES = [
  {
    code: 'SALARY_CERT', name: 'Salary certificate', category: 'letter',
    description: 'Confirms employment and current monthly salary',
    template: `This is to certify that {{employeeName}} (CPR No. {{cprNumber}}, Employee ID {{employeeCode}}), a {{nationality}} national, has been employed by {{companyName}} since {{hireDate}} and currently holds the position of {{jobTitle}} in the {{department}} department.

The employee's current monthly salary is as follows:
${SALARY_LINES}

This certificate has been issued at the employee's request for the purpose of {{purpose}}, without any financial or legal liability on the part of the company.`,
  },
  {
    code: 'EMPLOYMENT_CERT', name: 'Employment certificate', category: 'letter',
    description: 'Confirms current employment without salary details',
    template: `This is to certify that {{employeeName}} (CPR No. {{cprNumber}}, Employee ID {{employeeCode}}) has been employed by {{companyName}} since {{hireDate}} and currently holds the position of {{jobTitle}} in the {{department}} department.

This certificate has been issued at the employee's request for the purpose of {{purpose}}, without any financial or legal liability on the part of the company.`,
  },
  {
    code: 'EXPERIENCE_CERT', name: 'Experience certificate', category: 'letter',
    description: 'Confirms the period of employment and role',
    template: `This is to certify that {{employeeName}} (Employee ID {{employeeCode}}) has worked with {{companyName}} from {{hireDate}} to {{today}} as {{jobTitle}} in the {{department}} department.

During this period the employee carried out their duties with dedication and professionalism. We wish them every success in their future endeavours.`,
  },
  {
    code: 'SALARY_TRANSFER', name: 'Salary transfer letter', category: 'letter',
    description: 'Addressed to a bank, confirming the salary will be transferred there',
    template: `We confirm that {{employeeName}} (CPR No. {{cprNumber}}, Employee ID {{employeeCode}}) is employed by {{companyName}} as {{jobTitle}} since {{hireDate}}.

The employee's monthly salary is as follows:
${SALARY_LINES}

At the employee's request, we undertake to transfer the employee's monthly salary to account {{iban}} held with {{bankName}}, and not to change the receiving account without a clearance letter from your bank, for as long as the employee remains in our service.`,
  },
  {
    code: 'NOC', name: 'No objection certificate (NOC)', category: 'letter',
    description: 'States the company has no objection to the stated purpose',
    template: `This is to certify that {{employeeName}} (CPR No. {{cprNumber}}, Employee ID {{employeeCode}}) is employed by {{companyName}} as {{jobTitle}} since {{hireDate}}.

The company has no objection to the employee's request regarding: {{purpose}}.

{{details}}

This certificate has been issued at the employee's request, without any financial or legal liability on the part of the company.`,
  },
  { code: 'DOCUMENT_REQUEST', name: 'Document request', category: 'general', description: 'Request a copy of a document held by HR', template: null },
  { code: 'REIMBURSEMENT', name: 'Reimbursement claim', category: 'general', description: 'Taxi, travel, purchases - attach the receipt', template: null },
  { code: 'SALARY_ADVANCE', name: 'Salary advance / loan', category: 'general', description: 'Repaid from salary', template: null },
  { code: 'BANK_CHANGE', name: 'Bank account change', category: 'general', description: 'New IBAN for salary - attach the bank IBAN letter', template: null },
  { code: 'DETAILS_CHANGE', name: 'Personal details change', category: 'general', description: 'Name, marital status, ID - HR approves', template: null },
  { code: 'OTHER', name: 'Other request', category: 'general', description: 'Any other HR request', template: null },
];
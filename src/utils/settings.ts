import fs from 'fs';
import prisma from '../config/prisma';
import { filePath } from './fileStorage';

// Editable company settings (requirements section 25). Values fall back to .env, then to defaults.
const SETTING_DEFAULTS: Record<string, string> = {
  companyName: process.env.COMPANY_NAME || 'Company',
  companyAddress: process.env.COMPANY_ADDRESS || '',
  companyPhone: '',
  companyEmail: '',
  companyWebsite: '',
  companyLogo: '',            // stored file name of the uploaded logo
  workdayStart: '08:00',
  workdayEnd: '17:00',
  expiryAlertDays: '30',      // alert HR this many days before a document/contract expires
  hrSignatoryName: 'Human Resources Department',
  hrSignatoryTitle: '',
  ceoName: 'Mahmood Aladraj',   // signs internship acceptance letters
  ceoTitle: 'CEO',
};

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...SETTING_DEFAULTS, ...saved };
}

export interface CompanyInfo {
  name: string;
  address: string;
  contact: string;
  logoPath: string | null;
}

// Used by PDFs (payslips, letters, reports)
export async function getCompany(): Promise<CompanyInfo> {
  const s = await getSettings();
  const logo = s.companyLogo ? filePath(s.companyLogo) : null;
  return {
    name: s.companyName,
    address: s.companyAddress,
    contact: [s.companyPhone, s.companyEmail, s.companyWebsite].filter(Boolean).join('  |  '),
    logoPath: logo && fs.existsSync(logo) ? logo : null,
  };
}
import { Prisma } from '@prisma/client';

export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export const CURRENCY: Record<string, { code: string; decimals: number }> = {
  BH: { code: 'BHD', decimals: 3 }, // fils
  SA: { code: 'SAR', decimals: 2 }, // halalas
};

export function round(value: Prisma.Decimal, country: string) {
  return value.toDecimalPlaces(CURRENCY[country]?.decimals ?? 2, Prisma.Decimal.ROUND_HALF_UP);
}

// ───── periods ("2026-11") ─────
export function periodRange(period: string) {
  const [y, m] = period.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) }; // end = last day
}

export function periodLabel(period: string) {
  const { start } = periodRange(period);
  return start.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); // "November 2026"
}

// BR-4.4: daily rate = basic salary / 30
export const dailyRate = (basic: Prisma.Decimal) => basic.div(30);

// Part-month for someone hired during the period: paid days / 30
export function prorationFactor(hireDate: Date | null, period: string) {
  const { start, end } = periodRange(period);
  if (!hireDate || hireDate <= start) return D(1);
  if (hireDate > end) return D(0);
  const days = Math.round((end.getTime() - hireDate.getTime()) / 86_400_000) + 1;
  return D(Math.min(days, 30)).div(30);
}

// ───── social insurance ─────
export interface Contribution { code: string; name: string; rate: number }

const CONTRIBUTION_CAP: Record<string, number> = {
  BH: 4000,   // BHD per month
  SA: 45000,  // SAR per month
};

// Saudi new-scheme annuity rate rises 0.5% every July until 11% (each side)
function saudiNewAnnuityRate(period: string) {
  if (period < '2025-07') return 9;
  if (period < '2026-07') return 9.5;
  if (period < '2027-07') return 10;
  if (period < '2028-07') return 10.5;
  return 11;
}

// Bahrain employer pension share rises 1% a year to 17% in 2028
function bahrainEmployerPension(period: string) {
  const year = Number(period.slice(0, 4));
  if (year <= 2025) return 14;
  if (year === 2026) return 15;
  if (year === 2027) return 16;
  return 17;
}

export interface SiProfile {
  country: string;
  isNational: boolean;
  siNewScheme: boolean;
  yearsOfService: number;
}

export function socialInsurance(p: SiProfile, period: string): { employee: Contribution[]; employer: Contribution[] } {
  if (p.country === 'BH') {
    if (p.isNational) {
      return {
        employee: [
          { code: 'SIO_PENSION', name: 'SIO pension (employee)', rate: 7 },
          { code: 'SIO_UNEMPLOYMENT', name: 'Unemployment insurance', rate: 1 },
        ],
        employer: [
          { code: 'SIO_PENSION_ER', name: 'SIO pension (employer)', rate: bahrainEmployerPension(period) },
          { code: 'SIO_INJURY_ER', name: 'Employment injury', rate: 3 },
        ],
      };
    }
    return {
      employee: [{ code: 'SIO_UNEMPLOYMENT', name: 'Unemployment insurance', rate: 1 }],
      employer: [
        { code: 'SIO_INJURY_ER', name: 'Employment injury', rate: 3 },
        // expat end-of-service paid to SIO since March 2024: 4.2% first 3 years, 8.4% after
        { code: 'SIO_EOS_ER', name: 'End of service (expatriate)', rate: p.yearsOfService < 3 ? 4.2 : 8.4 },
      ],
    };
  }

  // Saudi Arabia (GOSI)
  if (p.isNational) {
    const annuity = p.siNewScheme ? saudiNewAnnuityRate(period) : 9;
    return {
      employee: [
        { code: 'GOSI_ANNUITY', name: 'GOSI annuities (employee)', rate: annuity },
        { code: 'GOSI_SANED', name: 'SANED unemployment', rate: 0.75 },
      ],
      employer: [
        { code: 'GOSI_ANNUITY_ER', name: 'GOSI annuities (employer)', rate: annuity },
        { code: 'GOSI_SANED_ER', name: 'SANED (employer)', rate: 0.75 },
        { code: 'GOSI_HAZARD_ER', name: 'Occupational hazards', rate: 2 },
      ],
    };
  }
  return { employee: [], employer: [{ code: 'GOSI_HAZARD_ER', name: 'Occupational hazards', rate: 2 }] };
}

export function contributionBase(country: string, base: Prisma.Decimal) {
  const cap = D(CONTRIBUTION_CAP[country] ?? Number.MAX_SAFE_INTEGER);
  return Prisma.Decimal.min(base, cap);
}
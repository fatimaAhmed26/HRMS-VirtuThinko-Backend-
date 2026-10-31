
export type Tier = { days: number; payPercent: number };

export interface LeaveRules {
  allowance: string;
  days: number;
  daysAfterYears: number | null;
  daysAfter: number | null;
  accrueFirstYear: boolean;
  payTiers: unknown;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEKEND = [5, 6]; // Friday, Saturday (Bahrain & Saudi)

export function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10); // "2026-11-01"
}

// Count leave days between two dates (inclusive)
export function countDays(start: Date, end: Date, workingDaysOnly: boolean, holidays: Set<string>) {
  let count = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const d = new Date(t);
    if (workingDaysOnly && (WEEKEND.includes(d.getUTCDay()) || holidays.has(toDateKey(d)))) continue;
    count++;
  }
  return count;
}

// Full months of service between hire date and a given date
export function monthsOfService(hireDate: Date, asOf: Date) {
  let months = (asOf.getUTCFullYear() - hireDate.getUTCFullYear()) * 12 + (asOf.getUTCMonth() - hireDate.getUTCMonth());
  if (asOf.getUTCDate() < hireDate.getUTCDate()) months--;
  return Math.max(0, months);
}

// Yearly entitlement, e.g. Bahrain 2.5 days/month in year 1, Saudi 21 -> 30 after 5 years
export function yearlyEntitlement(rules: LeaveRules, hireDate: Date | null, asOf: Date) {
  if (!hireDate) return rules.days;
  const months = monthsOfService(hireDate, asOf);
  if (rules.accrueFirstYear && months < 12) {
    return Math.floor(((rules.days / 12) * months) * 2) / 2; // round down to half days
  }
  if (rules.daysAfterYears && rules.daysAfter && months >= rules.daysAfterYears * 12) {
    return rules.daysAfter;
  }
  return rules.days;
}

export function tiersOf(rules: LeaveRules, maxDays: number): Tier[] {
  if (Array.isArray(rules.payTiers) && rules.payTiers.length > 0) return rules.payTiers as Tier[];
  return [{ days: maxDays, payPercent: 100 }];
}

// Split requested days over pay tiers, starting after the days already used
// e.g. Bahrain sick, 10 used + 10 requested -> [{days:5,payPercent:100},{days:5,payPercent:50}]
export function payBreakdown(tiers: Tier[], alreadyUsed: number, requested: number) {
  const result: Tier[] = [];
  let skip = alreadyUsed;
  let left = requested;
  for (const tier of tiers) {
    if (left <= 0) break;
    const available = Math.max(0, tier.days - skip);
    skip = Math.max(0, skip - tier.days);
    const take = Math.min(available, left);
    if (take > 0) {
      result.push({ days: take, payPercent: tier.payPercent });
      left -= take;
    }
  }
  return result;
}
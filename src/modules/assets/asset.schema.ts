import { z } from 'zod';

export const ASSET_CATEGORIES = ['laptop', 'phone', 'monitor', 'access_card', 'car', 'other'] as const;
export const ASSET_CONDITIONS = ['good', 'fair', 'damaged'] as const;

// Prefix of the auto tag printed on the item, e.g. VT-LAP-0001
export const ASSET_PREFIX: Record<(typeof ASSET_CATEGORIES)[number], string> = {
  laptop: 'LAP', phone: 'PHN', monitor: 'MON', access_card: 'ACC', car: 'CAR', other: 'OTH',
};

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export const createAssetSchema = z.object({
  category: z.enum(ASSET_CATEGORIES),
  name: z.string().trim().min(1, 'Give the item a name').max(100),
  serial: optionalText(100),
  condition: z.enum(ASSET_CONDITIONS).default('good'),
  country: z.enum(['BH', 'SA']),
  notes: optionalText(255),
});

export const assignSchema = z.object({ employeeId: z.number().int().positive() });
export const returnSchema = z.object({ condition: z.enum(ASSET_CONDITIONS).default('good') });
export const employeeQuerySchema = z.object({ employeeId: z.coerce.number().int().positive() });

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type ReturnInput = z.infer<typeof returnSchema>;

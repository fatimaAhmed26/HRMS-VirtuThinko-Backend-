import { z } from 'zod';

// The signature is a PNG drawn on a canvas, sent as a data URL
export const signSchema = z.object({
  signerName: z.string().trim().min(2, 'Type your full name').max(150),
  signatureImage: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/, 'Draw your signature first'),
  consent: z.boolean().refine((v) => v === true, 'Confirm that you agree to sign electronically'),
});

export const employeeQuerySchema = z.object({ employeeId: z.coerce.number().int().positive() });

export type SignInput = z.infer<typeof signSchema>;

import { z } from 'zod';

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Must be at least 3 characters')
  .max(40, 'Must be at most 40 characters')
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    'Lowercase alphanumeric and hyphens only; cannot start or end with a hyphen'
  );

const US_STATE_CODES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
] as const;

const usStateSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(US_STATE_CODES, { message: 'Invalid US state code' }));

const zipSchema = z
  .string()
  .trim()
  .regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code');

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s\-().]{7,20}$/, 'Invalid phone number');

export const locationInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  address: z.string().trim().min(3).max(255),
  city: z.string().trim().min(2).max(100),
  state: usStateSchema,
  zipCode: zipSchema,
  phone: phoneSchema.optional().or(z.literal('')),
  timezone: z.string().trim().max(64).optional(),
  salesTaxRate: z
    .number()
    .min(0, 'Sales tax must be >= 0')
    .max(0.5, 'Sales tax must be <= 50%')
    .optional(),
});

export const startSignupSchema = z.object({
  business: z.object({
    name: z.string().trim().min(2).max(120),
    slug: slugSchema,
  }),
  owner: z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    fullName: z.string().trim().min(2).max(120),
  }),
  location: locationInputSchema,
});

export const verifySignupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().trim().regex(/^\d{6}$/, 'Verification code must be 6 digits'),
});

export type StartSignupInput = z.infer<typeof startSignupSchema>;
export type VerifySignupInput = z.infer<typeof verifySignupSchema>;
export type LocationInput = z.infer<typeof locationInputSchema>;

export interface StartSignupResult {
  email: string;
  expiresAt: string;
}

export interface VerifySignupResult {
  clientId: string;
  locationId: string;
  userId: string;
}

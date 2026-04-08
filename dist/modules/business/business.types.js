"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifySignupSchema = exports.startSignupSchema = exports.additionalLocationInputSchema = exports.locationInputSchema = void 0;
const zod_1 = require("zod");
const slugSchema = zod_1.z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Must be at least 3 characters')
    .max(40, 'Must be at most 40 characters')
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Lowercase alphanumeric and hyphens only; cannot start or end with a hyphen');
const US_STATE_CODES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
    'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
    'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
];
const usStateSchema = zod_1.z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(zod_1.z.enum(US_STATE_CODES, { message: 'Invalid US state code' }));
const zipSchema = zod_1.z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code');
const phoneSchema = zod_1.z
    .string()
    .trim()
    .regex(/^\+?[\d\s\-().]{7,20}$/, 'Invalid phone number');
exports.locationInputSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(120),
    slug: slugSchema,
    address: zod_1.z.string().trim().min(3).max(255),
    city: zod_1.z.string().trim().min(2).max(100),
    state: usStateSchema,
    zipCode: zipSchema,
    phone: phoneSchema.optional().or(zod_1.z.literal('')),
    timezone: zod_1.z.string().trim().max(64).optional(),
    salesTaxRate: zod_1.z
        .number()
        .min(0, 'Sales tax must be >= 0')
        .max(0.5, 'Sales tax must be <= 50%')
        .optional(),
});
// Sibling locations under an existing client share the parent's subdomain,
// so the slug field is omitted (the create_client_location RPC auto-generates
// a unique locations.slug from the name).
exports.additionalLocationInputSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(120),
    address: zod_1.z.string().trim().min(3).max(255),
    city: zod_1.z.string().trim().min(2).max(100),
    state: usStateSchema,
    zipCode: zipSchema,
    phone: phoneSchema.optional().or(zod_1.z.literal('')),
    timezone: zod_1.z.string().trim().max(64).optional(),
    salesTaxRate: zod_1.z
        .number()
        .min(0, 'Sales tax must be >= 0')
        .max(0.5, 'Sales tax must be <= 50%')
        .optional(),
});
exports.startSignupSchema = zod_1.z.object({
    business: zod_1.z.object({
        name: zod_1.z.string().trim().min(2).max(120),
        slug: slugSchema,
    }),
    owner: zod_1.z.object({
        email: zod_1.z.string().trim().toLowerCase().email(),
        password: zod_1.z.string().min(8, 'Password must be at least 8 characters').max(128),
        fullName: zod_1.z.string().trim().min(2).max(120),
    }),
    location: exports.locationInputSchema,
});
exports.verifySignupSchema = zod_1.z.object({
    email: zod_1.z.string().trim().toLowerCase().email(),
    otp: zod_1.z.string().trim().regex(/^\d{6}$/, 'Verification code must be 6 digits'),
});

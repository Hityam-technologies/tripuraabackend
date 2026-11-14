const { z } = require('zod');

const heroSchema = z.object({
  videoUrl: z.string().optional().default(''),
  title: z.string().optional().default(''),
  subtitle: z.string().optional().default(''),
  posterUrl: z.string().optional().default(''),
  isActive: z.boolean().optional().default(true),
});

const storeSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().optional().default(''),
  addressLine1: z.string().optional().default(''),
  addressLine2: z.string().optional().default(''),
  landmark: z.string().optional().default(''),
  timings: z.string().optional().default(''),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  mapsQuery: z.string().optional().default(''),
});

const supportSchema = z.object({
  channels: z.array(z.object({
    id: z.string().optional(),
    type: z.string().min(1),
    label: z.string().min(1),
    value: z.string().min(1),
    message: z.string().optional().default(''),
    sortOrder: z.coerce.number().int().optional(),
  })),
});

const faqSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    question: z.string().min(1),
    answer: z.string().min(1),
    sortOrder: z.coerce.number().int().optional(),
  })),
});

const legalSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  id: z.string().optional(),
});

const tryOnConsentSchema = z.object({
  title: z.string().optional(),
  points: z.array(z.string()).optional(),
  agreeLabel: z.string().optional(),
}).optional();

const legalSchema = z.object({
  title: z.string().min(1).optional(),
  subtitle: z.string().optional(),
  intro: z.string().optional(),
  markdown: z.string().optional().default(''),
  effectiveDate: z.string().optional(),
  contactPhone: z.string().optional(),
  contactNote: z.string().optional(),
  closing: z.string().optional(),
  agreeLine: z.string().optional(),
  tryOnConsent: tryOnConsentSchema,
  sections: z.array(legalSectionSchema).optional().default([]),
  updatedAt: z.string().optional(),
});

module.exports = { heroSchema, storeSchema, supportSchema, faqSchema, legalSchema };

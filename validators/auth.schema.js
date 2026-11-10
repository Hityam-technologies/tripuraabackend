const { z } = require('zod');
const { emailSchema, passwordSchema, phoneSchema } = require('./common.schema');

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
});

const verifySchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/),
  purpose: z.enum(['registration', 'forgot-password']).optional(),
});

const resendSchema = z.object({
  email: emailSchema,
  purpose: z.enum(['registration', 'forgot-password']).default('registration'),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

const resetSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/),
  newPassword: passwordSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

module.exports = { registerSchema, verifySchema, resendSchema, loginSchema, refreshSchema, resetSchema, changePasswordSchema };

import { z } from 'zod';

// Normalize before validating: z.email().trim() would check the format first
// and reject " Foo@Example.com ". Lowercasing here is what makes the unique
// index on users.email effectively case-insensitive.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Некорректный email').max(254));

// The upper bound caps the work argon2 does per request.
const newPasswordSchema = z
  .string()
  .min(8, 'Пароль должен быть не короче 8 символов')
  .max(128, 'Пароль должен быть не длиннее 128 символов');

export const registerSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
});

// Login does not enforce the password policy: it may change after
// a user has registered, and the error must not hint at the rules.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1).max(128),
});

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  /** Access token lifetime in seconds. */
  expiresIn: z.number().int().positive(),
  user: userSchema,
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type User = z.infer<typeof userSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;

import { z } from 'zod';
import { timeZoneSchema } from './recurring.js';

// Normalize before validating: z.email().trim() would check the format first
// and reject " Foo@Example.com ". Lowercasing here is what makes the unique
// index on users.email effectively case-insensitive.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  // Request docs describe the input side of the pipe, which on its own is
  // just a string: restate the rules enforced after the pipe for OpenAPI.
  .meta({ format: 'email', maxLength: 254 })
  .pipe(z.email('Некорректный email').max(254));

// The upper bound caps the work argon2 does per request.
const newPasswordSchema = z
  .string()
  .min(8, 'Пароль должен быть не короче 8 символов')
  .max(128, 'Пароль должен быть не длиннее 128 символов');

export const registerSchema = z
  .object({
    email: emailSchema,
    password: newPasswordSchema,
    /**
     * Where the user is, as the browser knows it. Kept on the account
     * because a background job has no request to ask: which month a budget
     * alert is about depends on it.
     */
    timeZone: timeZoneSchema.default('UTC'),
  })
  .meta({ id: 'RegisterRequest' });

// Login does not enforce the password policy: it may change after
// a user has registered, and the error must not hint at the rules.
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().min(1, 'Введите email'),
    password: z
      .string()
      .min(1, 'Введите пароль')
      .max(128, 'Пароль должен быть не длиннее 128 символов'),
  })
  .meta({ id: 'LoginRequest' });

export const forgotPasswordSchema = z
  .object({ email: emailSchema })
  .meta({ id: 'ForgotPasswordRequest' });

// The token comes from the emailed link, not from a field the user fills.
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Ссылка недействительна'),
    newPassword: newPasswordSchema,
  })
  .meta({ id: 'ResetPasswordRequest' });

export const userSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    /** Mail when a budget of the month is overspent. */
    budgetAlerts: z.boolean(),
  })
  .meta({ id: 'User' });

export const notificationSettingsSchema = z
  .object({
    budgetAlerts: z.boolean(),
  })
  .meta({ id: 'NotificationSettings' });

export const authResponseSchema = z
  .object({
    accessToken: z.string(),
    /** Access token lifetime in seconds. */
    expiresIn: z.number().int().positive(),
    user: userSchema,
  })
  .meta({ id: 'AuthResponse' });

export const changePasswordSchema = z
  .object({
    // Not the policy: it may have changed since the password was set.
    currentPassword: z
      .string()
      .min(1, 'Введите текущий пароль')
      .max(128, 'Пароль должен быть не длиннее 128 символов'),
    newPassword: newPasswordSchema,
  })
  .refine((dto) => dto.newPassword !== dto.currentPassword, {
    message: 'Новый пароль совпадает с текущим',
    path: ['newPassword'],
  })
  .meta({ id: 'ChangePasswordRequest' });

/** A signed-in device. */
export const authSessionSchema = z
  .object({
    id: z.uuid(),
    /** "Chrome, Windows"; "Неизвестное устройство" if the browser did not say. */
    device: z.string(),
    /** Where the last sign-in or refresh came from; null if unknown. */
    ip: z.string().nullable(),
    createdAt: z.coerce.date(),
    lastUsedAt: z.coerce.date(),
    /** The session of this request. */
    current: z.boolean(),
  })
  .meta({ id: 'AuthSession' });

/** Active sessions: the current one first, then by last activity. */
export const authSessionListSchema = z
  .array(authSessionSchema)
  .meta({ id: 'AuthSessionList' });

export type RegisterDto = z.infer<typeof registerSchema>;
export type NotificationSettingsDto = z.infer<
  typeof notificationSettingsSchema
>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type User = z.infer<typeof userSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;

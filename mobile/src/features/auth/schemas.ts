import { z } from 'zod';

// Password minimum mirrors backend/api/auth_routes.py's server-side check
// (`len(req.password) < 6`) — client-side validation here is only a UX
// convenience, the backend remains the source of truth.
const email = z.string().trim().min(1, "Email kiritilishi shart").email("Email noto'g'ri formatda");
const password = z.string().min(6, "Parol kamida 6 ta belgidan iborat bo'lishi kerak");
const code = z.string().trim().length(6, "Kod 6 ta raqamdan iborat bo'lishi kerak");

export const loginSchema = z.object({ email, password });
export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Ism kiritilishi shart'),
  email,
  password,
});
export type RegisterFormValues = z.infer<typeof registerSchema>;

export const verifyCodeSchema = z.object({ code });
export type VerifyCodeFormValues = z.infer<typeof verifyCodeSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    code,
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Parollar mos kelmadi',
    path: ['confirmPassword'],
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

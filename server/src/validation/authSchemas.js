import { z } from "zod";
import { normalizeEmail } from "../utils/identity.js";

const emailSchema = z.preprocess(
    (value) => normalizeEmail(value),
    z.string().email().max(254),
);

const strongPassword = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long")
    .refine((v) => /[a-z]/.test(v), { message: "Must include a lowercase letter" })
    .refine((v) => /[A-Z]/.test(v), { message: "Must include an uppercase letter" })
    .refine((v) => /\d/.test(v), { message: "Must include a digit" })
    .refine((v) => /[^A-Za-z0-9]/.test(v), { message: "Must include a special character" });

export const RegisterSchema = z.object({
    name: z.string().trim().min(1).max(100),
    email: emailSchema,
    password: strongPassword,
    termsAccepted: z.literal(true),
});

export const LoginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1),
});

export const VerifyEmailSchema = z.object({
    token: z.string().min(1),
    email: emailSchema,
});

export const ResendVerificationSchema = z.object({
    email: emailSchema,
});

export const ForgotPasswordSchema = z.object({
    email: emailSchema,
});

export const ResetPasswordSchema = z.object({
    token: z.string().min(1),
    email: emailSchema,
    newPassword: strongPassword,
});

export const GoogleIdTokenSchema = z.object({
    idToken: z.string().min(1),
    termsAccepted: z.boolean().optional().default(false),
});

export const UpdateProfileSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: strongPassword.optional(),
    preferredProgrammingLanguage: z.enum(["javascript", "python", "cpp", "java"]).optional(),
    practiceGoal: z.enum(["get-first-role", "switch-role", "promotion", "confidence", "other"]).optional(),
    targetRole: z.string().trim().max(120).optional(),
    weeklyPracticeTarget: z.number().int().min(1).max(7).optional(),
    reminderEnabled: z.boolean().optional(),
    reminderDay: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]).optional(),
    reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    reminderTimezone: z.string().min(1).max(80).refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Invalid timezone").optional(),
}).refine((data) => {
    if (data.newPassword && !data.currentPassword) return false;
    return true;
}, { message: "currentPassword is required when changing password", path: ["currentPassword"] });

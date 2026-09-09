import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const ssoIdentitySchema = new mongoose.Schema(
    {
        organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
        issuer: { type: String, required: true, trim: true, maxlength: 500 },
        subject: { type: String, required: true, trim: true, maxlength: 500 },
    },
    { _id: false }
);

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: 254,
        },
        password: {
            type: String,
            // Only required for local accounts
            required: function () {
                return this.provider === "local";
            },
        },
        provider: {
            type: String,
            enum: ["local", "google", "sso"],
            default: "local",
        },
        googleId: {
            type: String,
            trim: true,
            unique: true,
            sparse: true,
        },
        ssoIdentities: { type: [ssoIdentitySchema], default: [] },
        isVerified: {
            type: Boolean,
            default: false,
        },
        verificationToken: {
            type: String,
        },
        verificationTokenExpires: {
            type: Date,
        },
        resetPasswordToken: {
            type: String,
        },
        resetPasswordExpires: {
            type: Date,
        },
        termsAcceptedAt: { type: Date, default: null },
        termsVersion: { type: String, maxlength: 80, default: "" },
        privacyVersion: { type: String, maxlength: 80, default: "" },
        lastAuthenticatedAt: { type: Date, default: null },
        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user",
        },
        preferredProgrammingLanguage: {
            type: String,
            enum: ["javascript", "python", "cpp", "java"],
            default: "cpp",
        },
        interviewerVoicePreference: {
            type: String,
            enum: ["random", "male", "female"],
            default: "random",
        },
        practiceGoal: {
            type: String,
            enum: ["get-first-role", "switch-role", "promotion", "confidence", "other"],
            default: "confidence",
        },
        targetRole: {
            type: String,
            trim: true,
            maxlength: 120,
            default: "",
        },
        weeklyPracticeTarget: {
            type: Number,
            min: 1,
            max: 7,
            default: 3,
        },
        reminderEnabled: {
            type: Boolean,
            default: false,
        },
        reminderDay: {
            type: String,
            enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
            default: "monday",
        },
        reminderTime: {
            type: String,
            match: /^([01]\d|2[0-3]):[0-5]\d$/,
            default: "19:00",
        },
        reminderTimezone: {
            type: String,
            maxlength: 80,
            validate: {
                validator: (value) => {
                    try {
                        new Intl.DateTimeFormat("en", { timeZone: value });
                        return true;
                    } catch {
                        return false;
                    }
                },
                message: "Invalid timezone",
            },
            default: "UTC",
        },
        lastReminderKey: { type: String, default: "", select: false },
        practicePlan: { type: String, enum: ["free", "pro"], default: "free", index: true },
        practiceSubscriptionStatus: { type: String, enum: ["inactive", "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"], default: "inactive" },
        practiceBillingProvider: { type: String, enum: ["none", "stripe"], default: "none", select: false },
        practiceBillingCustomerId: { type: String, default: "", select: false },
        practiceBillingSubscriptionId: { type: String, default: "", select: false },
        practiceCurrentPeriodEnd: { type: Date, default: null },
        // Trial eligibility is user-level anti-abuse state only. Hiring billing and usage remain organization-owned.
        hiringTrialClaimed: { type: Boolean, default: false, select: false },
        tokenVersion: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

userSchema.index({ "ssoIdentities.organization": 1, "ssoIdentities.issuer": 1, "ssoIdentities.subject": 1 });

// Encrypt password before save
userSchema.pre("save", async function (next) {
    // Hash password only for local provider and when modified
    if (this.provider !== "local") return next();
    if (!this.isModified("password")) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Match password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;

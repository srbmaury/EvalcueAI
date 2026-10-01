import jwt from "jsonwebtoken";
import User from "../models/User.js";
import metrics from "../metrics/index.js";
import { normalizeRoute } from "../metrics/routes.js";

const protect = async (req, res, next) => {
    try {
        const authHeader = req.get("authorization") || req.get("Authorization");
        if (!authHeader || !/^bearer\s+/i.test(authHeader)) {
            metrics.authorizationDeniedTotal.labels("missing_token", normalizeRoute(req)).inc();
            return res.status(401).json({ message: "Not authorized" });
        }
        const token = authHeader.slice(7).trim();
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("_id name email role provider preferredProgrammingLanguage interviewerVoicePreference practiceGoal targetRole weeklyPracticeTarget reminderEnabled reminderDay reminderTime reminderTimezone practicePlan practiceSubscriptionStatus tokenVersion isVerified +practiceBillingCustomerId +practiceBillingProvider practiceCurrentPeriodEnd practiceCancelAtPeriodEnd");
        if (!user) { metrics.authorizationDeniedTotal.labels("user_missing", normalizeRoute(req)).inc(); return res.status(401).json({ message: "User not found" }); }
        // Reject access tokens invalidated by security-sensitive account changes,
        // such as a password change or password reset.
        if (decoded.tokenVersion != null && user.tokenVersion !== decoded.tokenVersion) {
            metrics.authorizationDeniedTotal.labels("session_expired", normalizeRoute(req)).inc();
            return res.status(401).json({ message: "Session expired" });
        }
        req.user = user;
        if (!req.user) return res.status(401).json({ message: "User not found" });
        return next();
    } catch (error) {
        metrics.authorizationDeniedTotal.labels("invalid_token", normalizeRoute(req)).inc();
        return res.status(401).json({ message: "Not authorized" });
    }
};

export default protect;

import { buildTransactionalEmail } from "./transactionalEmail.js";

const safeTimeZone = (value) => {
    const candidate = value || "UTC";
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
        return candidate;
    } catch {
        return "UTC";
    }
};

const formatDateTime = (value, timeZone) => {
    if (!value) return "No fixed time";
    const zone = safeTimeZone(timeZone);
    return `${new Intl.DateTimeFormat("en-US", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: zone,
    }).format(new Date(value))} (${zone})`;
};

const requirementLines = (integrity = {}) => {
    if (!integrity?.enabled) return [];
    const requirements = ["Integrity monitoring enabled"];
    if (integrity.requireCamera) requirements.push("Camera required");
    if (integrity.requireFullscreen) requirements.push("Fullscreen required");
    return requirements;
};

export const buildHiringInvitationEmail = ({
    candidateName = "there",
    candidateEmail,
    organizationName = "Hiring team",
    assessmentTitle,
    jobRole,
    durationMinutes = 30,
    opensAt,
    expiresAt,
    timezone = "UTC",
    candidateLink,
    contactEmail = "",
    inviteOnly = false,
    integrity = {},
}) => {
    const requirements = requirementLines(integrity);
    const details = [
        { label: "Organization", value: organizationName },
        { label: "Role", value: jobRole },
        { label: "Assessment", value: assessmentTitle },
        { label: "Estimated time", value: `${durationMinutes || 30} minutes` },
        ...(opensAt ? [{ label: "Opens", value: formatDateTime(opensAt, timezone) }] : []),
        { label: "Deadline", value: expiresAt ? formatDateTime(expiresAt, timezone) : "No fixed deadline" },
        { label: "Access", value: inviteOnly ? "Invitation-only — use this personal link and the invited email address" : "Use the assessment link below" },
        ...requirements.map((value) => ({ label: "Requirement", value })),
    ];

    const subject = `${organizationName}: invitation to ${assessmentTitle}`;
    const mail = buildTransactionalEmail({
        subject,
        preheader: `Complete the ${assessmentTitle} for ${jobRole}.`,
        greeting: `Hi ${candidateName || "there"},`,
        heading: "You’re invited to complete an assessment",
        intro: `${organizationName} invited you to complete ${assessmentTitle} for the ${jobRole} role. Review the details below before you begin.`,
        cta: { label: "Start assessment", url: candidateLink },
        details,
        note: "Open the assessment when you have enough uninterrupted time to finish. If an access or accommodation issue prevents you from starting, contact the recruiting team before the deadline.",
        supportEmail: contactEmail,
        footer: "This invitation was sent because a recruiting team added your email to an Evalcue AI assessment.",
    });

    return {
        to: candidateEmail,
        ...mail,
        ...(contactEmail ? { replyTo: contactEmail } : {}),
    };
};

export { formatDateTime as formatHiringDateTime };

import { buildTransactionalEmail } from "./transactionalEmail.js";

export const buildPracticeReminderEmail = ({ name, email, role, dashboard, sessions = [] }) => {
    const sessionLines = sessions.map((session) => `Session ${session.number}: ${session.title}\nFocus: ${session.focus}\nStart: ${session.url}`).join("\n\n");
    const details = sessions.map((session) => ({
        label: `Session ${session.number}`,
        value: `${session.title} — ${session.focus}`,
        link: { label: `Start session ${session.number}`, url: session.url },
    }));
    const mail = buildTransactionalEmail({
        subject: `Your EvalcueAI weekly practice plan — ${sessions.length} session${sessions.length === 1 ? "" : "s"}`,
        preheader: `Your ${role || "Software Engineer"} practice plan is ready.`,
        greeting: `Hi ${name || "there"},`,
        heading: "Your weekly practice plan is ready",
        intro: `We prepared ${sessions.length} focused ${role || "Software Engineer"} session${sessions.length === 1 ? "" : "s"} for this week.`,
        cta: { label: "Open practice dashboard", url: dashboard },
        details,
        note: "Each session link opens a separately prepared interview template. You can change your target role, weekly plan size, or reminder schedule from Profile.",
        footer: "You received this because weekly practice reminders are enabled on your EvalcueAI account.",
    });
    return { to: email, ...mail, text: `${mail.text}\n\n${sessionLines}`.trim() };
};

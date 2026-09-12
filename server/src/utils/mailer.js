import fetch from "node-fetch";
import { buildTransactionalEmail } from "./transactionalEmail.js";

const BREVO_API_URL = "https://api.brevo.com/v3";
const envTrim = (value) => typeof value === "string" ? value.trim() : value;

const brevoRequest = async (path, options = {}) => {
    const apiKey = envTrim(process.env.BREVO_API_KEY);
    if (!apiKey) throw new Error("BREVO_API_KEY is not configured");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(`${BREVO_API_URL}${path}`, {
            ...options,
            signal: controller.signal,
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "api-key": apiKey,
                ...(options.headers || {}),
            },
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(`Brevo API ${response.status}: ${body?.message || "request failed"}`);
        }
        return response.status === 204 ? {} : response.json();
    } finally {
        clearTimeout(timeout);
    }
};

const recipients = (to) => (Array.isArray(to) ? to : String(to || "").split(","))
    .map((email) => typeof email === "string" ? { email: email.trim() } : email)
    .filter((recipient) => recipient?.email);

export const sendMail = async ({ to, subject, html, text, replyTo }) => {
    if (process.env.NODE_ENV === "test" && process.env.ALLOW_TEST_EMAIL !== "true") return;
    const senderEmail = envTrim(process.env.BREVO_SENDER_EMAIL);
    if (!senderEmail) throw new Error("BREVO_SENDER_EMAIL is not configured");
    const senderName = envTrim(process.env.BREVO_SENDER_NAME) || "Evalcue AI";
    const replyToEmail = envTrim(replyTo) || senderEmail;
    return brevoRequest("/smtp/email", {
        method: "POST",
        body: JSON.stringify({
            sender: { email: senderEmail, name: senderName },
            to: recipients(to),
            subject,
            ...(html ? { htmlContent: html } : {}),
            ...(text ? { textContent: text } : {}),
            replyTo: { email: replyToEmail, name: senderName },
            tags: ["evalcue-transactional"],
        }),
    });
};

export const verifyEmailProvider = async () => {
    await brevoRequest("/account", { method: "GET" });
    console.log("Brevo API verified: transactional email ready");
};

export const buildVerificationEmail = (name, verifyUrl) => buildTransactionalEmail({
    subject: "Verify your Evalcue AI email",
    preheader: "Verify your email to finish creating your Evalcue AI account.",
    greeting: `Hi ${name || "there"},`,
    heading: "Verify your email",
    intro: "Confirm this email address to finish setting up your Evalcue AI account.",
    cta: { label: "Verify email", url: verifyUrl },
    note: "This verification link expires after 24 hours. If you did not create this account, you can ignore this message.",
    footer: "You received this email because an Evalcue AI account was created with this address.",
});

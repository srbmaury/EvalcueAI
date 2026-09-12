import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("node-fetch", () => ({ default: fetchMock }));

const { sendMail, verifyEmailProvider } = await import("../../utils/mailer.js");

describe("Brevo transactional mailer", () => {
    beforeEach(() => {
        fetchMock.mockReset();
        process.env.NODE_ENV = "development";
        process.env.BREVO_API_KEY = "test-api-key";
        process.env.BREVO_SENDER_EMAIL = "sender@example.com";
        process.env.BREVO_SENDER_NAME = "Evalcue AI";
    });

    it("sends transactional email through the Brevo HTTPS API", async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 201, json: vi.fn().mockResolvedValue({ messageId: "message-1" }) });
        await expect(sendMail({ to: "person@example.com", subject: "Verify", html: "<p>Hello</p>", text: "Hello" })).resolves.toEqual({ messageId: "message-1" });
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.brevo.com/v3/smtp/email");
        expect(options.headers["api-key"]).toBe("test-api-key");
        expect(JSON.parse(options.body)).toMatchObject({
            sender: { email: "sender@example.com", name: "Evalcue AI" },
            to: [{ email: "person@example.com" }],
            subject: "Verify",
            replyTo: { email: "sender@example.com", name: "Evalcue AI" },
        });
    });

    it("uses an explicit reply-to address for recruiter-owned candidate emails", async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 201, json: vi.fn().mockResolvedValue({ messageId: "message-2" }) });
        await sendMail({ to: "candidate@example.com", subject: "Assessment", text: "Hello", replyTo: "recruiting@acme.example" });
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.replyTo).toEqual({ email: "recruiting@acme.example", name: "Evalcue AI" });
    });

    it("verifies the API key without sending email", async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ email: "account@example.com" }) });
        await verifyEmailProvider();
        expect(fetchMock).toHaveBeenCalledWith("https://api.brevo.com/v3/account", expect.objectContaining({ method: "GET" }));
    });
});

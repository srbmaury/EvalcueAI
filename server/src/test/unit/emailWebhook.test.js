import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateOne = vi.fn();
vi.mock("../../models/Assessment.js", () => ({ default: { updateOne } }));
const { default: routes } = await import("../../routes/emailWebhookRoutes.js");

describe("Brevo delivery webhook", () => {
    let app;
    beforeEach(() => { process.env.BREVO_WEBHOOK_SECRET = "long-test-secret"; app = express(); app.use(express.json()); app.use(routes); updateOne.mockResolvedValue({ modifiedCount: 1 }); });
    afterEach(() => vi.clearAllMocks());

    it("rejects events without the configured secret", async () => {
        await request(app).post("/brevo").send({ event: "delivered", email: "candidate@example.com" }).expect(401);
        expect(updateOne).not.toHaveBeenCalled();
    });

    it("ignores delivery events that cannot be tied to a provider message", async () => {
        const response = await request(app).post("/brevo").set("x-evalcue-webhook-secret", "long-test-secret").send({ event: "delivered", email: "candidate@example.com" }).expect(200);
        expect(response.body.updated).toBe(false);
        expect(updateOne).not.toHaveBeenCalled();
    });

    it("updates only the matching provider message and records event ordering metadata", async () => {
        const response = await request(app).post("/brevo").set("x-evalcue-webhook-secret", "long-test-secret").send({
            event: "delivered",
            "message-id": "provider-1",
            "event-id": "event-1",
            ts_event: 1_800_000_000,
            email: "candidate@example.com",
        }).expect(200);
        expect(response.body.updated).toBe(true);
        expect(updateOne).toHaveBeenCalledWith(
            expect.objectContaining({
                invitations: expect.objectContaining({
                    $elemMatch: expect.objectContaining({ providerMessageId: "provider-1", providerEventId: { $ne: "event-1" } }),
                }),
            }),
            expect.objectContaining({
                $set: expect.objectContaining({
                    "invitations.$.status": "delivered",
                    "invitations.$.providerEventId": "event-1",
                }),
            }),
        );
    });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    userUpdateOne: vi.fn(),
    organizationUpdateOne: vi.fn(),
}));

vi.mock("../../models/User.js", () => ({ default: { updateOne: mocks.userUpdateOne } }));
vi.mock("../../models/Organization.js", () => ({ default: { updateOne: mocks.organizationUpdateOne } }));
vi.mock("../../models/BillingEvent.js", () => ({ default: {} }));
vi.mock("../../config/stripe.js", () => ({ getStripe: vi.fn() }));
vi.mock("../../metrics/index.js", () => ({ default: new Proxy({}, { get: () => ({ labels: () => ({ inc: vi.fn(), observe: vi.fn() }) }) }) }));

import { currentPeriodEnd, syncHiringSubscription, syncPracticeSubscription } from "../../controllers/billingWebhookController.js";

const clearPriceEnv = () => {
    delete process.env.STRIPE_HIRING_STARTER_PRICE_ID;
    delete process.env.STRIPE_HIRING_GROWTH_PRICE_ID;
    delete process.env.STRIPE_PRACTICE_PRO_PRICE_ID;
};

describe("currentPeriodEnd", () => {
    it("reads the period end from the subscription item, not the subscription itself (Stripe API 2026-08-26.dahlia moved it there)", () => {
        const subscription = { current_period_end: 1_700_000_000, items: { data: [{ current_period_end: 1_800_000_000 }] } };
        expect(currentPeriodEnd(subscription)).toEqual(new Date(1_800_000_000 * 1000));
    });

    it("returns null when no item carries a period end", () => {
        expect(currentPeriodEnd({ items: { data: [] } })).toBeNull();
    });
});

describe("syncHiringSubscription", () => {
    afterEach(() => { vi.clearAllMocks(); clearPriceEnv(); });

    it("still records a cancellation even when the plan can't be resolved from a stale price/metadata", async () => {
        const subscription = {
            id: "sub_1",
            status: "canceled",
            customer: "cus_1",
            items: { data: [{ price: { id: "price_unknown" }, current_period_end: 1_700_000_000 }] },
            metadata: { organizationId: "org_1" },
        };
        await syncHiringSubscription(subscription, new Date("2026-01-01T00:00:00Z"));

        expect(mocks.organizationUpdateOne).toHaveBeenCalledOnce();
        const [, updateArg] = mocks.organizationUpdateOne.mock.calls[0];
        expect(updateArg.$set.hiringSubscriptionStatus).toBe("canceled");
        expect(updateArg.$set.hiringBillingSubscriptionId).toBe("sub_1");
        expect(updateArg.$set).not.toHaveProperty("hiringPlan");
    });

    it("guards against an out-of-order/retried webhook overwriting a newer applied state", async () => {
        const subscription = { id: "sub_1", status: "active", customer: "cus_1", items: { data: [] }, metadata: { organizationId: "org_1" } };
        const staleEventCreatedAt = new Date("2020-01-01T00:00:00Z");
        await syncHiringSubscription(subscription, staleEventCreatedAt);

        const [filterArg] = mocks.organizationUpdateOne.mock.calls[0];
        expect(filterArg).toMatchObject({ _id: "org_1" });
        expect(filterArg.$or).toEqual([
            { hiringBillingSyncedEventAt: null },
            { hiringBillingSyncedEventAt: { $lte: staleEventCreatedAt } },
        ]);
    });

    it("resolves a known plan from the price id", async () => {
        process.env.STRIPE_HIRING_STARTER_PRICE_ID = "price_starter";
        const subscription = {
            id: "sub_2",
            status: "active",
            customer: "cus_2",
            items: { data: [{ price: { id: "price_starter" }, current_period_end: 1_700_000_000 }] },
            metadata: { organizationId: "org_2" },
        };
        await syncHiringSubscription(subscription);
        const [, updateArg] = mocks.organizationUpdateOne.mock.calls[0];
        expect(updateArg.$set.hiringPlan).toBe("starter");
    });
});

describe("syncPracticeSubscription", () => {
    afterEach(() => { vi.clearAllMocks(); clearPriceEnv(); });

    it("still records a status change even when the plan can't be resolved", async () => {
        const subscription = { id: "sub_3", status: "past_due", customer: "cus_3", items: { data: [] }, metadata: { userId: "user_1" } };
        await syncPracticeSubscription(subscription, new Date("2026-01-01T00:00:00Z"));
        const [, updateArg] = mocks.userUpdateOne.mock.calls[0];
        expect(updateArg.$set.practiceSubscriptionStatus).toBe("past_due");
        expect(updateArg.$set).not.toHaveProperty("practicePlan");
    });
});

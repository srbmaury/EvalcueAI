import BillingEvent from "../models/BillingEvent.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import { getStripe } from "../config/stripe.js";
import { getConfiguredPriceId } from "../services/billingCatalog.js";
import { activeHiringSubscriptionPlan } from "../services/hiringEntitlements.js";
import metrics from "../metrics/index.js";

const activeStatuses = new Set(["active", "trialing"]);
const BILLING_EVENT_LEASE_MS = Math.max(Number(process.env.BILLING_EVENT_LEASE_MS || 120_000), 30_000);

const priceIdOf = (subscription) => subscription.items?.data?.[0]?.price?.id || "";

const practicePlanFromSubscription = (subscription) => {
    const priceId = priceIdOf(subscription);
    if (priceId && priceId === getConfiguredPriceId("practice", "pro")) return "pro";
    if (subscription.metadata?.plan === "pro") return "pro";
    throw new Error("Unknown Practice subscription plan");
};

const hiringPlanFromSubscription = (subscription) => {
    const priceId = priceIdOf(subscription);
    if (priceId && priceId === getConfiguredPriceId("hiring", "starter")) return "starter";
    if (priceId && priceId === getConfiguredPriceId("hiring", "growth")) return "growth";
    if (["starter", "growth", "enterprise"].includes(subscription.metadata?.plan)) return subscription.metadata.plan;
    throw new Error("Unknown Hiring subscription plan");
};

// current_period_end lives on the subscription item, not the subscription itself, as of
// Stripe API version 2026-08-26.dahlia. These subscriptions are always single-item (see
// priceIdOf), so the first item's period end is the subscription's period end.
export const currentPeriodEnd = (subscription) => {
    const end = subscription.items?.data?.[0]?.current_period_end;
    return end ? new Date(end * 1000) : null;
};

const clearedHiringGrant = () => ({
    type: "none",
    candidateInterviews: 0,
    startsAt: null,
    expiresAt: null,
    grantId: "",
    grantedBy: null,
    source: "none",
    note: "",
    stripeCheckoutSessionId: "",
});

// Guards a subscription sync against out-of-order webhook delivery/retries: only apply
// an update if it is not older than the last one actually applied for this row. Live
// fetches (invoice events, checkout completion) pass no eventCreatedAt and always win,
// since a fresh read from Stripe is by definition not stale.
const notStaleFilter = (baseFilter, syncedAtField, eventCreatedAt) => {
    if (!eventCreatedAt) return baseFilter;
    return { ...baseFilter, $or: [{ [syncedAtField]: null }, { [syncedAtField]: { $lte: eventCreatedAt } }] };
};

export const syncPracticeSubscription = async (subscription, eventCreatedAt) => {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    const userId = subscription.metadata?.userId;
    const filter = userId ? { _id: userId } : { practiceBillingCustomerId: customerId };
    if (!userId && !customerId) return;
    const update = {
        practiceBillingProvider: "stripe",
        practiceBillingCustomerId: customerId || "",
        practiceBillingSubscriptionId: subscription.id,
        practiceSubscriptionStatus: subscription.status,
        practiceCurrentPeriodEnd: currentPeriodEnd(subscription),
        ...(eventCreatedAt ? { practiceBillingSyncedEventAt: eventCreatedAt } : {}),
    };
    try {
        update.practicePlan = practicePlanFromSubscription(subscription);
    } catch (error) {
        // Status (including a cancellation) must still be recorded even when the plan
        // can't be resolved (e.g. stale price/metadata after a catalog rotation) —
        // revocation must never silently fail to persist just because plan lookup failed.
        console.error("Unable to resolve Practice subscription plan; status will still sync", subscription.id, error.message);
    }
    await User.updateOne(notStaleFilter(filter, "practiceBillingSyncedEventAt", eventCreatedAt), { $set: update });
};

export const syncHiringSubscription = async (subscription, eventCreatedAt) => {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    const organizationId = subscription.metadata?.organizationId;
    const filter = organizationId ? { _id: organizationId } : { hiringBillingCustomerId: customerId };
    if (!organizationId && !customerId) return;
    const update = {
        hiringBillingProvider: "stripe",
        hiringBillingCustomerId: customerId || "",
        hiringBillingSubscriptionId: subscription.id,
        hiringSubscriptionStatus: subscription.status,
        hiringCurrentPeriodEnd: currentPeriodEnd(subscription),
        ...(eventCreatedAt ? { hiringBillingSyncedEventAt: eventCreatedAt } : {}),
    };
    try {
        update.hiringPlan = hiringPlanFromSubscription(subscription);
    } catch (error) {
        console.error("Unable to resolve Hiring subscription plan; status will still sync", subscription.id, error.message);
    }
    if (activeStatuses.has(subscription.status)) {
        update.hiringTrialEligible = false;
        update.hiringGrant = clearedHiringGrant();
    }
    await Organization.updateOne(notStaleFilter(filter, "hiringBillingSyncedEventAt", eventCreatedAt), { $set: update });
};

export const syncSubscription = async (subscription, eventCreatedAt) => {
    const product = subscription.metadata?.billingProduct;
    if (product === "practice") await syncPracticeSubscription(subscription, eventCreatedAt);
    else if (product === "hiring") await syncHiringSubscription(subscription, eventCreatedAt);
    else throw new Error("Subscription is missing billingProduct metadata");
    metrics.billingSubscriptionTransitionsTotal.labels(subscription.status || "unknown").inc();
};

const syncInvoiceSubscription = async (invoice) => {
    if (!invoice.subscription) return;
    const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription.id;
    if (!subscriptionId) return;
    await syncSubscription(await getStripe().subscriptions.retrieve(subscriptionId));
};

const boundedInt = (value, fallback, min, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : fallback;
};

const activatePaidPilot = async (session) => {
    const organizationId = session.metadata?.organizationId || session.client_reference_id;
    if (!organizationId) throw new Error("Paid pilot checkout is missing organizationId metadata");
    const organization = await Organization.findById(organizationId).select("+hiringBillingCustomerId");
    if (!organization) throw new Error("Paid pilot organization not found");
    if (activeHiringSubscriptionPlan(organization)) return;
    if (organization.hiringGrant?.stripeCheckoutSessionId === session.id) return;

    const candidateInterviews = boundedInt(session.metadata?.candidateInterviews, 15, 1, 1000);
    const validDays = boundedInt(session.metadata?.validDays, 30, 1, 365);
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + validDays * 24 * 60 * 60 * 1000);
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

    await Organization.updateOne(
        { _id: organizationId },
        {
            $set: {
                hiringTrialEligible: false,
                hiringBillingProvider: "stripe",
                ...(customerId ? { hiringBillingCustomerId: customerId } : {}),
                hiringGrant: {
                    type: "paid_pilot",
                    candidateInterviews,
                    startsAt,
                    expiresAt,
                    grantId: `pilot:${session.id}`,
                    grantedBy: null,
                    source: "stripe",
                    note: `Paid launch pilot (${candidateInterviews} interviews / ${validDays} days)`,
                    stripeCheckoutSessionId: session.id,
                },
            },
        },
    );
};

const claimBillingEvent = async (event) => {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + BILLING_EVENT_LEASE_MS);
    try {
        const record = await BillingEvent.create({
            provider: "stripe",
            eventId: event.id,
            type: event.type,
            status: "processing",
            leaseExpiresAt,
            processedAt: null,
            lastError: "",
        });
        return { state: "claimed", record };
    } catch (error) {
        if (error?.code !== 11000) throw error;
    }

    // Lean is intentional: Mongoose schema defaults can make a legacy row that
    // predates the status field look like status="processing" in memory. Those
    // legacy rows were the old processed-event marker, so never replay them.
    const existing = await BillingEvent.findOne({ provider: "stripe", eventId: event.id }).lean();
    if (!existing) return { state: "busy", record: null };
    if (!existing.status || existing.status === "processed") return { state: "duplicate", record: existing };

    const retryable = existing.status === "failed" ||
        (existing.status === "processing" && (!existing.leaseExpiresAt || existing.leaseExpiresAt <= now));
    if (!retryable) return { state: "busy", record: existing };

    const filter = { _id: existing._id, status: existing.status };
    if (existing.status === "processing") filter.$or = [
        { leaseExpiresAt: { $lte: now } },
        { leaseExpiresAt: null },
    ];
    const record = await BillingEvent.findOneAndUpdate(
        filter,
        { $set: { type: event.type, status: "processing", leaseExpiresAt, processedAt: null, lastError: "" } },
        { new: true },
    );
    return record ? { state: "claimed", record } : { state: "busy", record: existing };
};

export const stripeWebhook = async (req, res) => {
    const startedAt = process.hrtime.bigint();
    let event;
    try {
        const signature = req.get("stripe-signature");
        if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send("Webhook signature configuration missing");
        event = getStripe().webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
        metrics.billingWebhooksTotal.labels("unknown", "invalid_signature").inc();
        metrics.billingWebhookDurationSeconds.labels("unknown", "invalid_signature").observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
        return res.status(400).send(`Invalid webhook: ${error.message}`);
    }

    let claim;
    try {
        claim = await claimBillingEvent(event);
    } catch (error) {
        console.error("Stripe webhook claim failed", event.id, error);
        metrics.billingWebhooksTotal.labels(event.type, "failure").inc();
        metrics.billingWebhookDurationSeconds.labels(event.type, "failure").observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
        return res.status(500).json({ message: "Webhook processing failed" });
    }

    if (claim.state === "duplicate") {
        metrics.billingWebhooksTotal.labels(event.type, "duplicate").inc();
        metrics.billingWebhookDurationSeconds.labels(event.type, "duplicate").observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
        return res.json({ received: true, duplicate: true });
    }
    if (claim.state === "busy") {
        // Do not acknowledge an event that another worker has only claimed, not
        // completed. A non-2xx response tells Stripe to retry if that worker dies.
        metrics.billingWebhooksTotal.labels(event.type, "busy").inc();
        metrics.billingWebhookDurationSeconds.labels(event.type, "busy").observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
        return res.status(409).json({ message: "Webhook is already being processed" });
    }

    try {
        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            const product = session.metadata?.billingProduct;
            const purchaseType = session.metadata?.purchaseType;
            if (product === "hiring" && purchaseType === "paid_pilot") {
                if (session.payment_status === "paid") await activatePaidPilot(session);
            } else if (product === "practice") {
                const userId = session.client_reference_id || session.metadata?.userId;
                await User.updateOne({ _id: userId }, { $set: {
                    practiceBillingProvider: "stripe",
                    practiceBillingCustomerId: session.customer || "",
                    practiceBillingSubscriptionId: session.subscription || "",
                } });
            } else if (product === "hiring") {
                const organizationId = session.metadata?.organizationId || session.client_reference_id;
                await Organization.updateOne({ _id: organizationId }, { $set: {
                    hiringBillingProvider: "stripe",
                    hiringBillingCustomerId: session.customer || "",
                    hiringBillingSubscriptionId: session.subscription || "",
                } });
            } else {
                throw new Error("Checkout session is missing billingProduct metadata");
            }
            if (session.subscription) {
                const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
                await syncSubscription(await getStripe().subscriptions.retrieve(subscriptionId));
            }
        } else if (event.type === "checkout.session.async_payment_succeeded") {
            const session = event.data.object;
            if (session.metadata?.billingProduct === "hiring" && session.metadata?.purchaseType === "paid_pilot") {
                await activatePaidPilot(session);
            }
        } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
            // Stripe does not guarantee delivery order; this event's own snapshot can be
            // stale relative to one already applied. Gate on event.created (not processedAt).
            await syncSubscription(event.data.object, new Date(event.created * 1000));
        } else if (["invoice.payment_failed", "invoice.payment_succeeded"].includes(event.type)) {
            // Stripe subscription status is the source of truth. Re-fetch it instead of
            // inferring subscription state from an individual invoice or charge event.
            await syncInvoiceSubscription(event.data.object);
        }

        const completed = await BillingEvent.updateOne(
            { _id: claim.record._id, status: "processing" },
            { $set: { status: "processed", processedAt: new Date(), leaseExpiresAt: null, lastError: "" } },
        );
        if (!completed.modifiedCount) throw new Error("Billing event processing lease was lost");

        metrics.billingWebhooksTotal.labels(event.type, "success").inc();
        metrics.billingWebhookDurationSeconds.labels(event.type, "success").observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
        return res.json({ received: true });
    } catch (error) {
        await BillingEvent.updateOne(
            { _id: claim.record._id, status: "processing" },
            { $set: { status: "failed", leaseExpiresAt: null, lastError: String(error?.message || error).slice(0, 1000) } },
        ).catch(() => {});
        console.error("Stripe webhook processing failed", event.id, error);
        metrics.billingWebhooksTotal.labels(event.type, "failure").inc();
        metrics.billingWebhookDurationSeconds.labels(event.type, "failure").observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
        return res.status(500).json({ message: "Webhook processing failed" });
    }
};

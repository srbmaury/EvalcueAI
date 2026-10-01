import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import PaymentOrder from "../models/PaymentOrder.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import { payuConfig, payuConfigured, paymentHash, sha512, verifyPayment, zionRequest } from "../config/payu.js";
import { getPayuPrice } from "./payuCatalog.js";

export const nextMonth = (date) => {
    const result = new Date(date);
    const day = result.getUTCDate();
    result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + 1);
    const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, last));
    return result;
};
const bounded = (value, fallback, max) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= max ? Number(value) : fallback;
export const createPayuCheckout = async ({ product, plan, user, organization, phone }) => {
    const recurring = plan !== "pilot";
    const price = getPayuPrice(product, plan);
    if (!price || !payuConfigured(recurring) || (recurring && !price.id)) throw Object.assign(new Error("PayU checkout is not configured for this plan"), { statusCode: 503 });
    const config = payuConfig();
    if (!/^[+\d][\d\s-]{7,19}$/.test(phone || "")) throw Object.assign(new Error("A valid billing phone number is required"), { statusCode: 400 });
    const billingOwner = organization?._id || user._id;
    // Clean up abandoned unpaid reservations only; ambiguous provisioning must be reconciled, never re-created.
    await PaymentOrder.updateMany({ product, billingOwner, status: "pending", expiresAt: { $lt: new Date() }, provisioning: "none" }, { $set: { status: "failed" } });
    const txnid = `ec${randomBytes(10).toString("hex")}`;
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const mandateEnd = new Date(now); mandateEnd.setUTCFullYear(now.getUTCFullYear() + 5);
    const fields = { key: config.key, txnid, amount: (price.unitAmount / 100).toFixed(2), productinfo: `EvalcueAI ${product} ${plan}`,
        firstname: String(user.name || "Customer").replace(/[|<>]/g, "").slice(0, 60), email: user.email, phone: phone.replace(/[\s-]/g, ""),
        surl: config.callbackUrl, furl: config.callbackUrl, udf1: product, udf2: plan, udf3: "", udf4: "", udf5: "" };
    if (fields.email.length > 50 || fields.email.includes("|")) throw Object.assign(new Error("This email cannot be used with PayU checkout; contact support"), { statusCode: 400 });
    if (recurring) {
        fields.api_version = "7"; fields.si = "1";
        fields.si_details = JSON.stringify({ billingAmount: fields.amount, billingCurrency: "INR", billingCycle: "MONTHLY", billingInterval: 1,
            paymentStartDate: nextMonth(now).toISOString().slice(0, 10), paymentEndDate: mandateEnd.toISOString().slice(0, 10) });
    }
    fields.hash = paymentHash(fields, config.salt);
    try {
        await PaymentOrder.create({ billingOwner, txnid, tokenHash: sha512(token), product, plan, user: user._id, organization: organization?._id || null,
            amount: price.unitAmount, planId: price.id, checkoutFields: fields, expiresAt: new Date(now.getTime() + 30 * 60000),
            mandateEnd: recurring ? mandateEnd : null,
            candidateInterviews: bounded(process.env.HIRING_PAID_PILOT_CANDIDATE_INTERVIEWS, 15, 1000), validDays: bounded(process.env.HIRING_PAID_PILOT_VALID_DAYS, 30, 365) });
    } catch (error) {
        if (error.code === 11000) throw Object.assign(new Error("A checkout is already pending. Complete it or wait 30 minutes before retrying."), { statusCode: 409 });
        throw error;
    }
    return { url: `${config.origin}/api/billing/payu/checkout/${txnid}?token=${token}` };
};

export const validateVerifiedPayment = (order, verified) => {
    const amount = Number(verified.transaction_amount ?? verified.amt ?? verified.amount);
    if (verified.status !== "success" || verified.unmappedstatus !== "captured" || !verified.mihpayid || !Number.isFinite(amount) || Math.round(amount * 100) !== order.amount) {
        throw Object.assign(new Error("Payment is not a verified captured payment for this order"), { statusCode: 409 });
    }
};

export const confirmPayuOrder = async (txnid) => {
    let order = await PaymentOrder.findOne({ txnid }).select("+checkoutFields");
    if (!order) throw Object.assign(new Error("Payment order not found"), { statusCode: 404 });
    if (order.status === "paid") return order;
    const verified = await verifyPayment(txnid);
    validateVerifiedPayment(order, verified);
    // Use the stored checkout time to keep replayed confirmations from extending access.
    const paidAt = new Date(order.createdAt);
    const paidUntil = order.plan === "pilot" ? new Date(paidAt.getTime() + order.validDays * 86400000) : nextMonth(paidAt);
    if (order.plan !== "pilot" && !order.subscriptionId) {
        const prefix = order.product === "practice" ? "practice" : "hiring";
        const Model = prefix === "practice" ? User : Organization;
        const owner = await Model.findById(prefix === "practice" ? order.user : order.organization);
        const newerCheckout = await PaymentOrder.exists({ product: order.product, billingOwner: order.billingOwner, status: "pending", _id: { $ne: order._id } });
        if (!owner || ["active", "trialing"].includes(owner[`${prefix}SubscriptionStatus`]) || newerCheckout) {
            await PaymentOrder.updateOne({ _id: order._id }, { $set: { provisioning: "review_required" } });
            throw Object.assign(new Error("Payment requires review before a renewal schedule can be created"), { statusCode: 409 });
        }
        const claimed = await PaymentOrder.findOneAndUpdate({ _id: order._id, provisioning: "none", status: { $ne: "paid" } }, { $set: { provisioning: "creating" } }, { new: true });
        if (!claimed) throw Object.assign(new Error("Subscription setup is pending reconciliation"), { statusCode: 409 });
        try {
            const { key } = payuConfig();
            const subscription = await zionRequest("POST", "", { merchantId: key, authRefId: String(verified.mihpayid),
                subscriberEmail: order.checkoutFields.email, subscriberMobile: order.checkoutFields.phone, customParameter: { evalcueOrder: txnid },
                subscriptionPlans: [{ planId: order.planId, planName: order.checkoutFields.productinfo, billingCycle: "MONTHLY", billingInterval: 1,
                    amount: { value: (order.amount / 100).toFixed(2), currency: "INR" }, startDate: paidUntil.toISOString(), totalCount: 59 }] });
            if (!subscription.subscriptionId) throw new Error("PayU returned no subscription ID");
            await PaymentOrder.updateOne({ _id: order._id }, { $set: { subscriptionId: subscription.subscriptionId, provisioning: "ready" } });
            order.subscriptionId = subscription.subscriptionId;
        } catch (error) {
            // Retrying an ambiguous POST could create a second debit schedule. Operations must look it up by evalcueOrder first.
            await PaymentOrder.updateOne({ _id: order._id }, { $set: { provisioning: "review_required" } });
            throw error;
        }
    }
    if (order.plan !== "pilot") {
        const live = await zionRequest("GET", order.subscriptionId);
        if (live.status !== "Enabled" || live.subscriptionId !== order.subscriptionId || String(live.authRefId) !== String(verified.mihpayid)) {
            throw Object.assign(new Error("PayU recurring mandate is awaiting activation"), { statusCode: 409 });
        }
    }
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const result = await PaymentOrder.updateOne({ _id: order._id, status: { $ne: "paid" } }, { $set: { status: "paid", paidAt, paidUntil, providerPaymentId: String(verified.mihpayid) } }, { session });
            if (!result.modifiedCount) return;
            if (order.plan === "pilot") {
                const activated = await Organization.updateOne({ _id: order.organization, hiringSubscriptionStatus: { $nin: ["active", "trialing"] } }, { $set: {
                    hiringTrialEligible: false, hiringBillingProvider: "payu", hiringBillingCustomerId: String(order.user),
                    hiringGrant: { type: "paid_pilot", candidateInterviews: order.candidateInterviews, startsAt: paidAt, expiresAt: paidUntil,
                        grantId: `pilot:${txnid}`, source: "payu", note: `Paid launch pilot (${order.candidateInterviews} interviews / ${order.validDays} days)`, paymentOrderId: txnid } } }, { session });
                if (!activated.modifiedCount) throw new Error("Billing owner already has an active subscription; reconcile payment before activation");
            } else {
                const prefix = order.product === "practice" ? "practice" : "hiring";
                const Model = order.product === "practice" ? User : Organization;
                const owner = order.product === "practice" ? order.user : order.organization;
                const update = { [`${prefix}Plan`]: order.plan, [`${prefix}SubscriptionStatus`]: "active", [`${prefix}BillingProvider`]: "payu",
                    [`${prefix}BillingCustomerId`]: String(order.user), [`${prefix}BillingSubscriptionId`]: order.subscriptionId,
                    [`${prefix}CurrentPeriodEnd`]: paidUntil, [`${prefix}CancelAtPeriodEnd`]: false };
                if (prefix === "hiring") { update.hiringTrialEligible = false; update.hiringGrant = { type: "none" }; }
                const activated = await Model.updateOne({ _id: owner, [`${prefix}SubscriptionStatus`]: { $nin: ["active", "trialing"] } }, { $set: update }, { session });
                if (!activated.modifiedCount) throw new Error("Billing owner already has an active subscription; reconcile payment before activation");
            }
        });
    } finally { await session.endSession(); }
    return PaymentOrder.findById(order._id);
};

export const reconcilePayuSubscription = async (subscriptionId) => {
    const order = await PaymentOrder.findOne({ subscriptionId, status: "paid" });
    if (!order) return;
    const live = await zionRequest("GET", subscriptionId);
    if (live.subscriptionId !== subscriptionId || String(live.authRefId) !== order.providerPaymentId) throw new Error("PayU subscription identity mismatch");
    const plan = live.subscriptionPlans?.find(p => p.planId === order.planId);
    if (!plan || Math.round(Number(plan.amount?.value) * 100) !== order.amount || plan.amount?.currency !== "INR") throw new Error("PayU subscription plan mismatch");
    const dates = plan.lastPaymentDate || plan.lastPaymentDates || [];
    const paymentTimes = (Array.isArray(dates) ? dates : [dates]).map(date => new Date(date).getTime()).filter(Number.isFinite);
    const lastPayment = new Date(paymentTimes.length ? Math.max(...paymentTimes) : NaN);
    const periodEnd = Number(plan.numberOfPaidInvoices) > 0 && Number.isFinite(lastPayment.getTime()) ? nextMonth(lastPayment) : order.paidUntil;
    const canceled = ["Cancelled", "Completed", "Forced_Cancel"].includes(live.status);
    const prefix = order.product === "practice" ? "practice" : "hiring";
    const Model = prefix === "practice" ? User : Organization;
    // A stale sync cannot overwrite a newer period or a different subscription.
    const update = canceled ? { [`${prefix}CancelAtPeriodEnd`]: true } : {};
    const status = periodEnd > new Date() ? "active" : canceled ? "canceled" : "past_due";
    await Model.updateOne({ _id: prefix === "practice" ? order.user : order.organization, [`${prefix}BillingProvider`]: "payu", [`${prefix}BillingSubscriptionId`]: subscriptionId,
        $or: [{ [`${prefix}CurrentPeriodEnd`]: { $lte: periodEnd } }, { [`${prefix}CurrentPeriodEnd`]: null }] },
    { $set: { ...update, [`${prefix}CurrentPeriodEnd`]: periodEnd, [`${prefix}SubscriptionStatus`]: status } });
};

import Stripe from "stripe";

let client;
export const getStripe = () => {
    if (!process.env.STRIPE_SECRET_KEY) throw Object.assign(new Error("Billing is not configured"), { statusCode: 503 });
    // Pin explicitly rather than trusting the SDK's bundled default: Stripe API versions
    // can move fields (e.g. current_period_end moved from Subscription to
    // SubscriptionItem in "2026-08-26.dahlia"), and an un-pinned client silently starts
    // reading undefined fields on the next `stripe` package upgrade instead of erroring.
    if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-08-26.dahlia", maxNetworkRetries: 2, timeout: 15000 });
    return client;
};

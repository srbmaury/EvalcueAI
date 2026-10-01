import express from "express";
import rateLimit from "express-rate-limit";
import { randomBytes } from "node:crypto";
import PaymentOrder from "../models/PaymentOrder.js";
import { payuConfig, sha512, validResponseHash } from "../config/payu.js";
import { confirmPayuOrder, reconcilePayuSubscription } from "../services/payuBilling.js";
import { hiringClientOrigin, practiceClientOrigin } from "../config/clientOrigins.js";

const router = express.Router();
router.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));
router.use(express.urlencoded({ extended: false, limit: "32kb" }), express.json({ limit: "32kb" }));
router.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" }); next();
});
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
router.get("/checkout/:txnid", async (req, res, next) => {
    try {
        if (!/^[a-f0-9]{64}$/.test(req.query.token || "")) return res.status(404).send("Checkout not found");
        const order = await PaymentOrder.findOne({ txnid: req.params.txnid, tokenHash: sha512(req.query.token), status: "pending", expiresAt: { $gt: new Date() } }).select("+checkoutFields");
        if (!order) return res.status(410).send("This checkout has expired or has already been completed. Return to billing to start again.");
        const { checkoutUrl } = payuConfig();
        const nonce = randomBytes(16).toString("base64");
        res.set("Content-Security-Policy", `default-src 'none'; style-src 'nonce-${nonce}'; form-action ${new URL(checkoutUrl).origin}; base-uri 'none'; frame-ancestors 'none'`);
        const recurring = order.plan !== "pilot";
        const inputs = Object.entries(order.checkoutFields).map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`).join("");
        return res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Review payment | EvalcueAI</title><style nonce="${nonce}">body{font:16px/1.7 system-ui;color:#222;margin:0;padding:32px;background:#fafafa}main{max-width:520px;margin:40px auto;background:white;border:1px solid #ddd;padding:32px;border-radius:4px}h1{line-height:1.2}button{background:#2451c7;color:white;border:0;padding:14px 24px;font:inherit;border-radius:4px;cursor:pointer}label{display:block;margin:24px 0}small{color:#555}</style></head><body><main><p>EvalcueAI · Secure payment</p><h1>${escapeHtml(order.checkoutFields.productinfo)}</h1><p><strong>₹${escapeHtml(order.checkoutFields.amount)}${recurring ? " each month" : " one-time"}</strong></p><p>${recurring ? "Your first payment starts your access. PayU will automatically collect the same amount monthly after you authorize a recurring mandate. You can stop renewal from billing management. The mandate runs for up to five years." : `Includes ${order.candidateInterviews} candidate interviews, valid for ${order.validDays} days. No automatic renewal.`}</p><form method="post" action="${checkoutUrl}">${inputs}<label><input type="checkbox" required> ${recurring ? "I authorize the monthly automatic renewal described above." : "I confirm this one-time payment."}</label><button type="submit">Continue to PayU</button></form><p><small>Payment details are entered on PayU. Contact support@evalcueai.com for billing questions.</small></p></main></body></html>`);
    } catch (error) { next(error); }
});
const confirmCallback = async (req, settle = true) => {
    const body = req.body;
    if (!body || Object.values(body).some(value => typeof value !== "string")) throw Object.assign(new Error("Invalid payment response"), { statusCode: 400 });
    const { key, salt } = payuConfig();
    if (body.key !== key || !validResponseHash(body, salt)) throw Object.assign(new Error("Invalid PayU signature"), { statusCode: 400 });
    const order = await PaymentOrder.findOne({ txnid: body.txnid }).select("+checkoutFields");
    if (!order) throw Object.assign(new Error("Unknown payment order"), { statusCode: 404 });
    for (const field of ["amount", "email", "firstname", "productinfo", "udf1", "udf2", "udf3", "udf4", "udf5"]) {
        if ((body[field] || "") !== (order.checkoutFields[field] || "")) throw Object.assign(new Error("Payment response does not match the order"), { statusCode: 400 });
    }
    // A success callback alone is insufficient: reconcile against the signed server API.
    if (settle && body.status === "success") return confirmPayuOrder(body.txnid);
    return order;
};
router.post("/return", async (req, res, next) => {
    try {
        const order = await confirmCallback(req, false);
        if (req.body.status === "success") {
            // Redirect to the polling page even if provider confirmation is temporarily unavailable.
            try { await confirmPayuOrder(order.txnid); } catch { /* status endpoint retries safely */ }
        }
        const origin = order.product === "practice" ? practiceClientOrigin() : hiringClientOrigin();
        const path = order.product === "practice" ? "/practice/billing/success" : "/hire/billing/success";
        const query = new URLSearchParams({ product: order.product, transaction: order.txnid, ...(order.plan === "pilot" ? { purchase: "pilot" } : {}), ...(order.organization ? { organizationId: String(order.organization) } : {}) });
        if (req.body.status !== "success") query.set("payment", "failed");
        return res.redirect(303, `${origin}${path}?${query}`);
    } catch (error) { next(error); }
});
router.post("/webhook", async (req, res, next) => {
    try { await confirmCallback(req); return res.json({ received: true }); } catch (error) { next(error); }
});
router.post("/zion-webhook", async (req, res, next) => {
    try {
        // Zion payloads are only wake-up hints. Never trust their status, amount, or owner IDs.
        const id = req.body?.subscriptionId;
        if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return res.status(400).json({ message: "Invalid subscription" });
        const known = await PaymentOrder.exists({ subscriptionId: id, status: "paid" });
        if (known) await reconcilePayuSubscription(id);
        return res.json({ received: true });
    } catch (error) { next(error); }
});
export default router;

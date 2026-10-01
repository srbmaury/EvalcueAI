import { createHash, timingSafeEqual } from "node:crypto";
export const sha512 = (value) => createHash("sha512").update(value).digest("hex");
export const payuConfigured = (recurring = false) => Boolean(
    ["test", "production"].includes(process.env.PAYU_ENV) && process.env.PAYU_MERCHANT_KEY && process.env.PAYU_MERCHANT_SALT && process.env.PAYU_CALLBACK_ORIGIN &&
    (!recurring || (process.env.PAYU_ZION_ENABLED === "true" && process.env.PAYU_ZION_TOKEN)),
);
export const payuConfig = () => {
    if (!payuConfigured()) throw Object.assign(new Error("PayU billing is not configured"), { statusCode: 503 });
    const callback = new URL(process.env.PAYU_CALLBACK_ORIGIN);
    if (callback.protocol !== "https:" || callback.username || callback.password || callback.pathname !== "/" || callback.search || callback.hash) throw Object.assign(new Error("PAYU_CALLBACK_ORIGIN must be an HTTPS origin"), { statusCode: 503 });
    const production = process.env.PAYU_ENV === "production";
    return { key: process.env.PAYU_MERCHANT_KEY, salt: process.env.PAYU_MERCHANT_SALT,
        checkoutUrl: production ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment",
        verifyUrl: production ? "https://info.payu.in/merchant/postservice.php?form=2" : "https://test.payu.in/merchant/postservice.php?form=2",
        zionUrl: production ? "https://subscription.payu.in" : "https://subscriptiontest.citruspay.com",
        callbackUrl: `${callback.origin}/api/billing/payu/return`, origin: callback.origin };
};
export const paymentHash = (f, salt) => sha512(
    ["key", "txnid", "amount", "productinfo", "firstname", "email", "udf1", "udf2", "udf3", "udf4", "udf5"].map(k => f[k] || "").join("|") + `||||||${f.si_details ? `${f.si_details}|` : ""}${salt}`,
);
export const responseHash = (f, salt) => sha512(
    (f.additionalCharges || f.additional_charges ? `${f.additionalCharges || f.additional_charges}|` : "") + `${salt}|${f.status}|` +
    (f.splitInfo ? `${f.splitInfo}|` : "") + `|||||${["udf5", "udf4", "udf3", "udf2", "udf1", "email", "firstname", "productinfo", "amount", "txnid", "key"].map(k => f[k] || "").join("|")}`,
);
export const validResponseHash = (f, salt) => typeof f.hash === "string" && /^[a-f0-9]{128}$/i.test(f.hash) && timingSafeEqual(Buffer.from(f.hash, "hex"), Buffer.from(responseHash(f, salt), "hex"));
export const verifyPayment = async (txnid, request = fetch) => {
    const { key, salt, verifyUrl } = payuConfig();
    const body = new URLSearchParams({ key, command: "verify_payment", var1: txnid, hash: sha512(`${key}|verify_payment|${txnid}|${salt}`) });
    const response = await request(verifyUrl, { method: "POST", body, redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("PayU verification is unavailable");
    const data = await response.json();
    if (Number(data.status) !== 1 || !data.transaction_details?.[txnid]) throw new Error("PayU transaction could not be verified");
    return data.transaction_details[txnid];
};
export const zionRequest = async (method, id, body, request = fetch) => {
    if (!payuConfigured(true)) throw Object.assign(new Error("PayU automatic renewal is not configured"), { statusCode: 503 });
    const { key, salt, zionUrl } = payuConfig();
    const signature = id ? `merchantId:${key}|subscriptionId:${id}|${salt}` : `merchantId:${key}|subscriptionPlanIds:[${body.subscriptionPlans.map(p => p.planId).join("|")}]|${salt}`;
    const response = await request(`${zionUrl}/api/sub/v1/merchant/subscriptions${id ? `/${encodeURIComponent(id)}` : ""}`, {
        method, headers: { "Content-Type": "application/json", merchantId: key, Authorization: `Bearer ${process.env.PAYU_ZION_TOKEN}`, "X-PayU-Subscription-Signature": sha512(signature) },
        ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`PayU subscription request failed (${response.status})`);
    return response.status === 204 ? null : response.json();
};

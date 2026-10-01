import servicePricing from "../../../shared/servicePricing.json" with { type: "json" };
const names = { practice: { pro: "PRACTICE_PRO" }, hiring: { pilot: "HIRING_PILOT", starter: "HIRING_STARTER", growth: "HIRING_GROWTH" } };
export const getPayuPrice = (product, plan) => {
    const name = names[product]?.[plan];
    if (!name) return null;
    const defaultPrice = servicePricing.find(price => price.product === product && price.plan === plan);
    const amount = process.env[`PAYU_${name}_AMOUNT_PAISE`] ?? String(defaultPrice?.unitAmount || "");
    if (!amount) return null;
    if (!/^\d+$/.test(amount) || !Number.isSafeInteger(Number(amount)) || Number(amount) < 100) return null;
    const id = process.env[`PAYU_${name}_PLAN_ID`] || "";
    return { id, unitAmount: Number(amount), currency: "inr", ...(plan === "pilot" ? { type: "one_time" } : { interval: "month", intervalCount: 1 }) };
};

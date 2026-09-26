const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
})[character]);

const detailText = (details = []) => details
    .filter((item) => item?.label && item?.value !== undefined && item?.value !== null && String(item.value).trim())
    .map((item) => `${item.label}: ${item.value}`);

const detailHtml = (details = []) => {
    const rows = details
        .filter((item) => item?.label && item?.value !== undefined && item?.value !== null && String(item.value).trim())
        .map((item) => `<tr><td style="padding:7px 12px 7px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${escapeHtml(item.label)}</td><td style="padding:7px 0;font-weight:600;color:#111827">${escapeHtml(item.value)}${item.link?.url ? `<br/><a href="${escapeHtml(item.link.url)}" style="display:inline-block;margin-top:6px;color:#2451c7;font-weight:700;text-decoration:none">${escapeHtml(item.link.label || "Open")} &rarr;</a>` : ""}</td></tr>`)
        .join("");
    return rows ? `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin:18px 0;border-collapse:collapse">${rows}</table>` : "";
};

export const buildTransactionalEmail = ({
    subject,
    preheader = "",
    greeting = "Hi there,",
    heading,
    intro = "",
    cta,
    details = [],
    note = "",
    supportEmail = "",
    footer = "This is a transactional message from EvalcueAI.",
}) => {
    const cleanDetails = detailText(details);
    const supportLine = supportEmail ? `Questions? Contact ${supportEmail}.` : "";
    const text = [
        subject,
        "",
        greeting,
        "",
        heading || subject,
        intro,
        "",
        ...(cta?.url ? [`${cta.label || "Open"}: ${cta.url}`, ""] : []),
        ...cleanDetails,
        ...(cleanDetails.length ? [""] : []),
        note,
        supportLine,
        "",
        "EvalcueAI",
        footer,
    ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").trim();

    const html = `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:Arial,sans-serif;color:#111827"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden"><tr><td style="padding:22px 28px;background:#111827;color:#ffffff;font-size:20px;font-weight:800">EvalcueAI</td></tr><tr><td style="padding:28px"><p style="margin:0 0 18px">${escapeHtml(greeting)}</p><h1 style="font-size:24px;line-height:1.25;margin:0 0 12px">${escapeHtml(heading || subject)}</h1>${intro ? `<p style="margin:0 0 18px;color:#374151;line-height:1.6">${escapeHtml(intro)}</p>` : ""}${cta?.url ? `<p style="margin:22px 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-weight:700">${escapeHtml(cta.label || "Open")}</a></p>` : ""}${detailHtml(details)}${note ? `<p style="margin:18px 0 0;color:#374151;line-height:1.6">${escapeHtml(note)}</p>` : ""}${supportLine ? `<p style="margin:12px 0 0;color:#374151">${escapeHtml(supportLine)}</p>` : ""}</td></tr><tr><td style="padding:18px 28px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5">EvalcueAI<br/>${escapeHtml(footer)}</td></tr></table></td></tr></table></body></html>`;

    return { subject, text, html };
};

export { escapeHtml };

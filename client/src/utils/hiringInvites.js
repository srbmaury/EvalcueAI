export const parseCandidateInvites = (value = "") => String(value)
    .split(/[\n,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .filter((email, index, values) => values.indexOf(email) === index)
    .map((email) => ({ email }));

export const invitationDeliverySummary = (results = []) => {
    const sent = results.filter((item) => item.sent).length;
    const queued = results.filter((item) => item.queued).length;
    const failed = results.length - sent - queued;
    if (failed && !sent && !queued) return { severity: "error", message: `${failed} invitation${failed === 1 ? "" : "s"} could not be sent.` };
    const parts = [];
    if (sent) parts.push(`${sent} sent`);
    if (queued) parts.push(`${queued} queued`);
    if (failed) parts.push(`${failed} failed`);
    return { severity: failed ? "warning" : "success", message: `Invitations: ${parts.join(" · ")}.` };
};

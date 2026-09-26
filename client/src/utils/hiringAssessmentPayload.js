const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const safeTimeZone = (value) => {
    const candidate = value || browserTimeZone();
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
        return candidate;
    } catch {
        return "UTC";
    }
};

const zonedParts = (value, timeZone) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
}).formatToParts(new Date(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

export const formatLocalDateTimeInput = (value, timeZone = browserTimeZone()) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const parts = zonedParts(date, timeZone);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

const offsetAt = (utcMs, timeZone) => {
    const parts = zonedParts(new Date(utcMs), timeZone);
    const renderedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    return renderedAsUtc - utcMs;
};

export const localDateTimeToIso = (value, timeZone = browserTimeZone()) => {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value));
    if (!match) return null;
    const [, year, month, day, hour, minute] = match;
    const wallClockUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
    const zone = safeTimeZone(timeZone);
    let resolved = wallClockUtc - offsetAt(wallClockUtc, zone);
    const refined = wallClockUtc - offsetAt(resolved, zone);
    if (refined !== resolved) resolved = refined;
    return new Date(resolved).toISOString();
};

export const formatAssessmentDateTime = (value, timeZone = "UTC") => {
    if (!value) return "No fixed time";
    const zone = safeTimeZone(timeZone || "UTC");
    return `${new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
    }).format(new Date(value))} (${zone})`;
};

const editableFields = [
    "title",
    "jobRole",
    "jobDescription",
    "followUpsEnabled",
    "askCandidateIntro",
    "inviteOnly",
    "candidateInstructions",
    "contactEmail",
    "durationMinutes",
    "opensAt",
    "expiresAt",
    "timezone",
    "integrity",
    "rubric",
    "templateName",
    "rounds",
];

export const buildEditableAssessmentPayload = (form, overrides = {}) => {
    const source = { ...form, ...overrides };
    const payload = {};
    for (const key of editableFields) {
        if (source[key] !== undefined) payload[key] = source[key];
    }
    payload.timezone = safeTimeZone(source.timezone);
    payload.opensAt = localDateTimeToIso(source.opensAt, payload.timezone);
    payload.expiresAt = localDateTimeToIso(source.expiresAt, payload.timezone);
    return payload;
};

const pad = (value) => String(value).padStart(2, "0");

export const formatLocalDateTimeInput = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const localDateTimeToIso = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const formatAssessmentDateTime = (value, timeZone = "UTC") => {
    if (!value) return "No fixed time";
    let zone = timeZone || "UTC";
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date(value));
    } catch {
        zone = "UTC";
    }
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
    payload.opensAt = localDateTimeToIso(source.opensAt);
    payload.expiresAt = localDateTimeToIso(source.expiresAt);
    return payload;
};

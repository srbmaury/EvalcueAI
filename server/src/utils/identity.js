export const normalizeEmail = (value = "") => String(value || "").trim().toLowerCase();

export const normalizeDomain = (value = "") => String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/\.+$/, "");

export const emailDomain = (value = "") => {
    const email = normalizeEmail(value);
    const index = email.lastIndexOf("@");
    return index > 0 && index < email.length - 1 ? normalizeDomain(email.slice(index + 1)) : "";
};

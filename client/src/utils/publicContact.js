const publicEmail = (configured, fallback) => String(configured || fallback).trim();

export const publicContactEmail = publicEmail(import.meta.env.VITE_CONTACT_EMAIL, "contact@evalcueai.com");
export const publicSupportEmail = publicEmail(import.meta.env.VITE_SUPPORT_EMAIL, "support@evalcueai.com");
export const publicSalesEmail = publicEmail(import.meta.env.VITE_SALES_EMAIL, "sales@evalcueai.com");

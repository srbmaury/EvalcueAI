export const optionalAntivirusScan = async (buffer) => {
    if (process.env.ENABLE_AV_SCAN !== "true") return { clean: true };
    try {
        const url = process.env.AV_SCAN_URL;
        if (!url) return { clean: true };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let resp;
        try {
            resp = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream" },
                body: buffer,
                signal: controller.signal,
            });
        } finally { clearTimeout(timeout); }
        if (!resp.ok) return { clean: false, reason: `scanner_http_${resp.status}` };
        const data = await resp.json().catch(() => ({}));
        // expected response: { clean: boolean, reason?: string }
        if (typeof data.clean === "boolean") return { clean: !!data.clean, reason: data.reason };
        return { clean: true };
    } catch (e) {
        // fail closed or open? Choose closed for security
        return { clean: false, reason: "scanner_error" };
    }
};

import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const normalizeIp = (value = "") => String(value).toLowerCase().split("%")[0];

export const isPrivateAddress = (address) => {
    const normalized = normalizeIp(address);
    if (normalized.startsWith("::ffff:")) {
        const mapped = normalized.slice(7);
        if (net.isIPv4(mapped)) return isPrivateAddress(mapped);
        return true;
    }
    if (net.isIPv4(normalized)) {
        const [a, b, c] = normalized.split(".").map(Number);
        return a === 0 || a === 10 || a === 127 || a >= 224 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 0 && c === 0) ||
            (a === 192 && b === 0 && c === 2) ||
            (a === 192 && b === 88 && c === 99) ||
            (a === 192 && b === 168) ||
            (a === 198 && (b === 18 || b === 19)) ||
            (a === 198 && b === 51 && c === 100) ||
            (a === 203 && b === 0 && c === 113);
    }
    if (net.isIPv6(normalized)) {
        if (!/^[23]/.test(normalized)) return true;
        return normalized.startsWith("2001:db8:") || normalized === "2001:db8::" ||
            normalized.startsWith("2001:0:") || normalized.startsWith("2001:10:") || normalized.startsWith("2001:20:") ||
            normalized.startsWith("2002:") || normalized.startsWith("3fff:");
    }
    return true;
};

const normalizeHostname = (url) => url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

export const resolvePublicUrl = async (rawUrl, { httpsOnly = false, allowHttp = true, allowCustomPorts = false } = {}) => {
    let url;
    try { url = rawUrl instanceof URL ? new URL(rawUrl.toString()) : new URL(rawUrl); }
    catch { throw new Error("Invalid URL"); }

    const allowedProtocols = httpsOnly ? ["https:"] : allowHttp ? ["http:", "https:"] : ["https:"];
    if (!allowedProtocols.includes(url.protocol) || url.username || url.password) throw new Error("Only public HTTP(S) URLs are allowed");
    if (!allowCustomPorts && ((url.protocol === "http:" && url.port && url.port !== "80") || (url.protocol === "https:" && url.port && url.port !== "443"))) {
        throw new Error("Custom URL ports are not allowed");
    }

    const hostname = normalizeHostname(url);
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname === "metadata.google.internal") {
        throw new Error("Private network URLs are not allowed");
    }

    if (net.isIP(hostname)) {
        if (isPrivateAddress(hostname)) throw new Error("Private network URLs are not allowed");
        return { url, address: hostname, family: net.isIP(hostname) };
    }

    let addresses;
    try { addresses = await dns.lookup(hostname, { all: true, verbatim: true }); }
    catch { throw new Error("Hostname could not be resolved"); }
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
        throw new Error("Hostname must resolve only to public addresses");
    }

    const chosen = addresses[0];
    return { url, address: normalizeIp(chosen.address), family: chosen.family || net.isIP(chosen.address) };
};

const requestOnce = ({ url, address, family }, { method = "GET", headers = {}, body, timeoutMs, maxBytes }) => new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        servername: url.protocol === "https:" ? url.hostname : undefined,
        lookup: (_hostname, options, callback) => {
            // Node's family autoselection requests all addresses on modern runtimes.
            // Return only the validated, pinned address in the requested shape.
            if (options?.all) callback(null, [{ address, family }]);
            else callback(null, address, family);
        },
    }, (response) => {
        const declared = Number(response.headers["content-length"] || 0);
        if (declared > maxBytes) {
            response.resume();
            reject(new Error("Response body is too large"));
            return;
        }
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                response.destroy(new Error("Response body is too large"));
                return;
            }
            chunks.push(chunk);
        });
        response.on("end", () => resolve({
            status: response.statusCode || 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
        }));
        response.on("error", reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Request timed out")));
    request.on("error", reject);
    if (body != null) request.write(body);
    request.end();
});

export const requestPublicUrl = async (rawUrl, {
    method = "GET",
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    maxRedirects = 0,
    httpsOnly = false,
    allowCustomPorts = false,
} = {}) => {
    let current = rawUrl instanceof URL ? new URL(rawUrl.toString()) : new URL(rawUrl);
    let currentMethod = method;
    let currentBody = body;

    for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
        const endpoint = await resolvePublicUrl(current, { httpsOnly, allowCustomPorts });
        const response = await requestOnce(endpoint, {
            method: currentMethod,
            headers,
            body: currentBody,
            timeoutMs,
            maxBytes,
        });

        if (REDIRECT_STATUSES.has(response.status)) {
            const location = response.headers.location;
            if (!location || redirects === maxRedirects) throw new Error("Too many redirects");
            current = new URL(location, endpoint.url);
            if (response.status === 303 || ((response.status === 301 || response.status === 302) && currentMethod === "POST")) {
                currentMethod = "GET";
                currentBody = undefined;
            }
            continue;
        }

        return { ...response, url: endpoint.url };
    }

    throw new Error("Request failed");
};

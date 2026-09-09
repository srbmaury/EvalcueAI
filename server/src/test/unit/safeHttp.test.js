import dns from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivateAddress, resolvePublicUrl } from "../../utils/safeHttp.js";

describe("DNS-pinned public HTTP validation", () => {
    afterEach(() => vi.restoreAllMocks());

    it("rejects private, link-local, documentation, and mapped-private addresses", () => {
        for (const address of [
            "127.0.0.1",
            "10.1.2.3",
            "169.254.169.254",
            "172.20.1.1",
            "192.168.1.1",
            "100.64.0.1",
            "198.18.0.1",
            "203.0.113.5",
            "::1",
            "fd00::1",
            "fe80::1",
            "::ffff:127.0.0.1",
        ]) expect(isPrivateAddress(address)).toBe(true);
        expect(isPrivateAddress("93.184.216.34")).toBe(false);
        expect(isPrivateAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
    });

    it("returns the exact public address that must be pinned into the socket lookup", async () => {
        vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
        const resolved = await resolvePublicUrl("https://example.com/jobs/123");
        expect(resolved.url.toString()).toBe("https://example.com/jobs/123");
        expect(resolved.address).toBe("93.184.216.34");
        expect(resolved.family).toBe(4);
    });

    it("rejects a hostname if any DNS answer points at a private network", async () => {
        vi.spyOn(dns, "lookup").mockResolvedValue([
            { address: "93.184.216.34", family: 4 },
            { address: "127.0.0.1", family: 4 },
        ]);
        await expect(resolvePublicUrl("https://rebind.example/jobs/123")).rejects.toThrow(/public addresses/i);
    });
});

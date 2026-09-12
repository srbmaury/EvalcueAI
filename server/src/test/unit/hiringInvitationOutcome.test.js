import { describe, expect, it } from "vitest";

describe("hiring invitation delivery result contract", () => {
    it("distinguishes sent, queued, and failed outcomes", () => {
        const results = [
            { email: "sent@example.com", sent: true, queued: false },
            { email: "queued@example.com", sent: false, queued: true },
            { email: "failed@example.com", sent: false, queued: false },
        ];
        expect(results.filter((item) => item.sent)).toHaveLength(1);
        expect(results.filter((item) => item.queued)).toHaveLength(1);
        expect(results.filter((item) => !item.sent && !item.queued)).toHaveLength(1);
    });
});

import { describe, expect, it } from "vitest";
import { parseCandidateInvites } from "../utils/hiringInvites";

describe("parseCandidateInvites", () => {
    it("returns no candidates for blank input so the UI can show a validation message", () => {
        expect(parseCandidateInvites("  \n, ; ")).toEqual([]);
    });

    it("normalizes comma, semicolon and newline separated email addresses", () => {
        expect(parseCandidateInvites("a@example.com, b@example.com\nc@example.com;d@example.com")).toEqual([
            { email: "a@example.com" },
            { email: "b@example.com" },
            { email: "c@example.com" },
            { email: "d@example.com" },
        ]);
    });
});

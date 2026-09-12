import { describe, expect, it } from "vitest";
import { candidateTranscriptionConfig } from "../utils/hiringVoicePolicy";

describe("candidate system design voice policy", () => {
    it("enables server transcription for hiring system-design rounds when the public capability is enabled", () => {
        expect(candidateTranscriptionConfig({
            shareToken: "share-token",
            attemptId: "attempt-1",
            attemptToken: "attempt-secret",
            capabilities: { transcription: true },
        })).toEqual({
            enabled: true,
            endpoint: "/assessments/public/share-token/attempts/attempt-1/transcribe",
            headers: { "x-attempt-token": "attempt-secret" },
        });
    });

    it("disables server transcription only when the public capability explicitly says it is unavailable", () => {
        expect(candidateTranscriptionConfig({
            shareToken: "share-token",
            attemptId: "attempt-1",
            attemptToken: "attempt-secret",
            capabilities: { transcription: false },
        }).enabled).toBe(false);
    });
});

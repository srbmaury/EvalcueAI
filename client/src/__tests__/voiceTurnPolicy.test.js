import { describe, expect, it } from "vitest";
import { shouldAutoSubmitVoiceTurn } from "../utils/voiceTurnPolicy";

const readyTurn = {
    answer: "I would use a cache in front of the database",
    silenceMs: 5500,
    thresholdMs: 5000,
    isListening: true,
    micSessionActive: true,
    aiSpeaking: false,
    hasInterimText: false,
    typedWorkspaceVisible: false,
    codingEnabled: false,
    submitting: false,
    readinessNeeded: false,
};

describe("shouldAutoSubmitVoiceTurn", () => {
    it("advances a completed voice answer after a short silence", () => {
        expect(shouldAutoSubmitVoiceTurn(readyTurn)).toBe(true);
    });

    it("does not advance while speech is still arriving", () => {
        expect(shouldAutoSubmitVoiceTurn({ ...readyTurn, hasInterimText: true })).toBe(false);
    });

    it("does not auto-submit typed or coding work", () => {
        expect(shouldAutoSubmitVoiceTurn({ ...readyTurn, codingEnabled: true })).toBe(false);
        expect(shouldAutoSubmitVoiceTurn({ ...readyTurn, typedWorkspaceVisible: true })).toBe(false);
    });
});

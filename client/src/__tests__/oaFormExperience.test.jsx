import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OAForm from "../components/OAForm";

vi.mock("../components/CodeEditorField", () => ({
    default: ({ value, onChange }) => (
        <textarea aria-label="Mock answer editor" value={value} onChange={(event) => onChange(event.target.value)} />
    ),
}));

vi.mock("../components/VoiceControls", () => ({ default: () => <button type="button">Replay question</button> }));
vi.mock("../components/SkipRoundButton", () => ({ default: () => <button type="button">Skip round</button> }));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("OAForm interview experience", () => {
    it("keeps one problem in focus and updates answered progress from the client draft immediately", async () => {
        const questions = [
            { question: { text: "Implement an LRU cache." } },
            { question: { text: "Explain the complexity." } },
        ];
        const answers = ["", "Already answered"];
        const onChange = vi.fn();
        const onSpeak = vi.fn().mockResolvedValue(true);

        render(
            <OAForm
                questions={questions}
                answers={answers}
                spokenAnswers={["", ""]}
                codingEnabled={[true, false]}
                onCodingModeChange={vi.fn()}
                codeDraftPrefix="round-1"
                roundName="Data Structures and Algorithms"
                onSpokenChange={vi.fn()}
                onChange={onChange}
                onSubmit={vi.fn()}
                onSkip={vi.fn()}
                submitting={false}
                supportsTTS
                supportsSTT
                listening={false}
                listeningTarget={null}
                onSpeak={onSpeak}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
            />,
        );

        expect(screen.getByRole("heading", { name: "Implement an LRU cache." })).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Explain the complexity." })).toBeNull();
        expect(screen.getByText("1/2 answered")).toBeTruthy();
        await waitFor(() => expect(onSpeak).toHaveBeenCalledWith(
            expect.stringContaining("Hi, welcome to the Data Structures and Algorithms round"),
        ));

        const firstEditor = await screen.findByLabelText("Mock answer editor");
        fireEvent.change(firstEditor, { target: { value: "class LRU {}" } });
        expect(onChange).toHaveBeenCalledWith(0, "class LRU {}");
        expect(screen.getByText("2/2 answered")).toBeTruthy();
        expect(screen.getByText("Ready to finish")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Next problem" }));
        expect(screen.getByRole("heading", { name: "Explain the complexity." })).toBeTruthy();
        expect(await screen.findByDisplayValue("Already answered")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Previous" }));
        expect(screen.getByRole("heading", { name: "Implement an LRU cache." })).toBeTruthy();
        expect(await screen.findByDisplayValue("class LRU {}")).toBeTruthy();
    });

    it("keeps round completion available from the focused workspace", () => {
        const onSubmit = vi.fn();
        render(
            <OAForm
                questions={[{ question: { text: "Describe a race condition." } }]}
                answers={["answer"]}
                spokenAnswers={[""]}
                codingEnabled={[false]}
                onCodingModeChange={vi.fn()}
                codeDraftPrefix="round-2"
                onSpokenChange={vi.fn()}
                onChange={vi.fn()}
                onSubmit={onSubmit}
                onSkip={vi.fn()}
                submitting={false}
                supportsTTS={false}
                supportsSTT={false}
                listening={false}
                listeningTarget={null}
                onSpeak={vi.fn()}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Finish coding round" }));
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Ready to finish")).toBeTruthy();
    });
});
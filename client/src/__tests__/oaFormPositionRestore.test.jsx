import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OAForm from "../components/OAForm";

vi.mock("../components/CodeEditorField", () => ({ default: () => <div /> }));
vi.mock("../components/SkipRoundButton", () => ({ default: () => <button type="button">Skip round</button> }));
vi.mock("../components/VoiceControls", () => ({ default: () => null }));

const questions = [
    { _id: "q1", question: { _id: "a", text: "Implement a login endpoint that returns a token." } },
    { _id: "q2", question: { _id: "b", text: "Version a REST API so clients can pick a version." } },
];

const renderForm = () => render(
    <OAForm questions={questions} answers={["", ""]} spokenAnswers={["", ""]} codingEnabled={[false, false]} onCodingModeChange={() => {}} codeDraftPrefix="interview-1:round-1" onSpokenChange={() => {}} onChange={() => {}} onSubmit={() => {}} supportsTTS={false} supportsSTT={false} />,
);

const problemLabel = () => screen.getByText(/problem \d of 2/i).textContent;

describe("OAForm reload position", () => {
    beforeEach(() => { window.sessionStorage.clear(); });
    afterEach(() => { cleanup(); });

    it("reopens the problem the candidate was on after a reload", () => {
        renderForm();
        fireEvent.click(screen.getByRole("button", { name: /go to question 2/i }));
        expect(problemLabel()).toMatch(/problem 2 of 2/i);

        cleanup();
        renderForm();
        expect(problemLabel()).toMatch(/problem 2 of 2/i);
    });

    // Observed live: after a reload the form renders before its questions arrive, and the placeholder
    // position 0 overwrote the saved one.
    it("keeps the saved problem when the questions arrive after the first render", () => {
        window.sessionStorage.setItem("oa-position:interview-1:round-1", "1");
        const props = { answers: ["", ""], spokenAnswers: ["", ""], codingEnabled: [false, false], onCodingModeChange: () => {}, codeDraftPrefix: "interview-1:round-1", onSpokenChange: () => {}, onChange: () => {}, onSubmit: () => {}, supportsTTS: false, supportsSTT: false };
        const { rerender } = render(<OAForm {...props} questions={[]} />);
        expect(window.sessionStorage.getItem("oa-position:interview-1:round-1")).toBe("1");

        rerender(<OAForm {...props} questions={questions} />);
        expect(problemLabel()).toMatch(/problem 2 of 2/i);
        expect(window.sessionStorage.getItem("oa-position:interview-1:round-1")).toBe("1");
    });

    it("starts at problem 1 when nothing was saved", () => {
        renderForm();
        expect(problemLabel()).toMatch(/problem 1 of 2/i);
    });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DebuggingRoundEditor from "../components/DebuggingRoundEditor";

vi.mock("../components/CodeEditorField", () => ({
    default: ({ value, onChange, readOnly, label }) => (
        <textarea
            aria-label={label || "Code editor"}
            value={value || ""}
            readOnly={readOnly}
            onChange={(event) => onChange?.(event.target.value)}
        />
    ),
}));

afterEach(() => cleanup());

const baseRound = (responseMode = "code_fix") => ({
    name: "Debugging",
    description: "Diagnose a production defect.",
    deliveryMode: "debugging",
    questionCount: 1,
    questions: [{ text: "Fix the duplicate charge bug.", required: true }],
    debugging: {
        responseMode,
        language: "javascript",
        starterCode: "function charge() { return false; }",
        tests: responseMode === "code_fix"
            ? [{ name: "charges once", stdin: "1", expectedOutput: "ok", hidden: false }]
            : [],
    },
});

describe("DebuggingRoundEditor", () => {
    it("edits assignment instructions, starter code, and code-fix tests", () => {
        const onChange = vi.fn();
        render(<DebuggingRoundEditor round={baseRound()} onChange={onChange} />);

        expect(screen.getByRole("heading", { name: "Debugging assignment" })).toBeTruthy();
        expect(screen.getByLabelText("Assignment instructions").value).toBe("Fix the duplicate charge bug.");
        expect(screen.getByLabelText("Starter code").value).toContain("function charge");
        expect(screen.getByLabelText("Test name 1").value).toBe("charges once");
        expect(screen.getByLabelText("Hidden test 1").checked).toBe(false);

        fireEvent.change(screen.getByLabelText("Starter code"), { target: { value: "function charge() { return true; }" } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            debugging: expect.objectContaining({ starterCode: "function charge() { return true; }" }),
        }));
    });

    it("switches to findings mode and removes executable test configuration", () => {
        const onChange = vi.fn();
        render(<DebuggingRoundEditor round={baseRound()} onChange={onChange} />);

        fireEvent.mouseDown(screen.getByLabelText("Candidate response"));
        fireEvent.click(screen.getByRole("option", { name: "Submit findings" }));

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            debugging: expect.objectContaining({ responseMode: "findings", tests: [] }),
        }));
    });

    it("does not render test controls for findings mode", () => {
        render(<DebuggingRoundEditor round={baseRound("findings")} onChange={() => {}} />);

        expect(screen.queryByText("Tests")).toBeNull();
        expect(screen.queryByLabelText("Test name 1")).toBeNull();
        expect(screen.getByText(/Candidates will document root cause/)).toBeTruthy();
    });
});

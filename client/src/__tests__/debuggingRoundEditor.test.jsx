import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DebuggingRoundEditor from "../components/DebuggingRoundEditor";

const post = vi.fn();
vi.mock("../api/axios", () => ({ default: { post } }));
vi.mock("../components/DebuggingProjectWorkspace", () => ({
    default: ({ files, onFilesChange }) => (
        <div>
            <div data-testid="project-files">{files.map((file) => `${file.path}:${file.kind}`).join("|")}</div>
            <button type="button" onClick={() => onFilesChange(files.map((file) => file.path === "src/index.js" ? { ...file, content: "fixed" } : file))}>Edit project source</button>
        </div>
    ),
}));

afterEach(() => cleanup());
beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ data: { valid: true, message: "Assignment validated." } });
});

const baseRound = (responseMode = "code_fix") => ({
    name: "Debugging",
    description: "Diagnose a production defect.",
    deliveryMode: "debugging",
    questionCount: 1,
    questions: [{ text: "Fix the duplicate charge bug.", required: true }],
    debugging: {
        responseMode,
        runtime: "node-22",
        entryFile: "src/index.js",
        files: [
            { path: "src/index.js", content: "buggy", kind: "source" },
            { path: "tests/payment.test.js", content: "visible", kind: "visible_test" },
            { path: "hidden/race.test.js", content: "hidden", kind: "hidden_test" },
        ],
    },
});

describe("DebuggingRoundEditor", () => {
    it("renders a recruiter-authored multi-file project", () => {
        render(<DebuggingRoundEditor round={baseRound()} onChange={() => {}} />);
        expect(screen.getByRole("heading", { name: "Debugging assignment" })).toBeTruthy();
        expect(screen.getByLabelText("Assignment instructions").value).toBe("Fix the duplicate charge bug.");
        expect(screen.getByLabelText("Runtime")).toBeTruthy();
        expect(screen.getByTestId("project-files").textContent).toContain("src/index.js:source");
        expect(screen.getByTestId("project-files").textContent).toContain("tests/payment.test.js:visible_test");
        expect(screen.getByTestId("project-files").textContent).toContain("hidden/race.test.js:hidden_test");
    });

    it("persists project file edits through the round payload", () => {
        const onChange = vi.fn();
        render(<DebuggingRoundEditor round={baseRound()} onChange={onChange} />);
        fireEvent.click(screen.getByRole("button", { name: "Edit project source" }));
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            debugging: expect.objectContaining({
                files: expect.arrayContaining([expect.objectContaining({ path: "src/index.js", content: "fixed", kind: "source" })]),
            }),
        }));
    });

    it("switches to findings mode without deleting the project", () => {
        const onChange = vi.fn();
        render(<DebuggingRoundEditor round={baseRound()} onChange={onChange} />);
        fireEvent.mouseDown(screen.getByLabelText("Candidate response"));
        fireEvent.click(screen.getByRole("option", { name: "Submit findings" }));
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            debugging: expect.objectContaining({ responseMode: "findings", files: expect.arrayContaining([expect.objectContaining({ path: "src/index.js" })]) }),
        }));
    });

    it("validates the exact authored project through the server", async () => {
        const onValidationChange = vi.fn();
        render(<DebuggingRoundEditor round={baseRound()} onChange={() => {}} onValidationChange={onValidationChange} />);
        fireEvent.click(screen.getByRole("button", { name: "Validate assignment" }));
        await waitFor(() => expect(post).toHaveBeenCalledWith("/assessments/debugging/validate", expect.objectContaining({
            instructions: "Fix the duplicate charge bug.",
            debugging: expect.objectContaining({ runtime: "node-22", files: expect.arrayContaining([expect.objectContaining({ path: "hidden/race.test.js", kind: "hidden_test" })]) }),
        })));
        await waitFor(() => expect(onValidationChange).toHaveBeenCalledWith(expect.objectContaining({ valid: true })));
    });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CandidateDebuggingRound from "../components/CandidateDebuggingRound";

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock("../api/axios", () => ({ default: mocks }));
vi.mock("../components/DebuggingProjectWorkspace", () => ({
    default: ({ files, onFilesChange, readOnly }) => (
        <div>
            <div data-testid="candidate-project">{files.map((file) => `${file.path}:${file.content}`).join("|")}</div>
            <div data-testid="candidate-readonly">{String(Boolean(readOnly))}</div>
            {!readOnly && <button type="button" onClick={() => onFilesChange(files.map((file) => file.path === "src/index.js" ? { ...file, content: "fixed" } : file))}>Fix source</button>}
        </div>
    ),
}));

const endpoint = "/assessments/public/share/attempts/attempt/debugging/0";
const headers = { "X-Attempt-Token": "token" };
const baseFiles = [
    { path: "src/index.js", content: "buggy", kind: "source" },
    { path: "tests/index.test.js", content: "visible", kind: "visible_test" },
];

const codeWorkspace = (overrides = {}) => ({
    responseMode: "code_fix",
    runtime: "node-22",
    instructions: "Fix duplicate processing.",
    baseFiles,
    files: baseFiles,
    visibleTestRuns: [],
    ...overrides,
});

beforeEach(() => {
    mocks.get.mockReset();
    mocks.put.mockReset();
    mocks.post.mockReset();
    mocks.put.mockImplementation(async () => ({ data: codeWorkspace() }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("CandidateDebuggingRound", () => {
    it("loads the server workspace, saves a multi-file patch, and runs only visible-test endpoint", async () => {
        mocks.get.mockResolvedValue({ data: codeWorkspace() });
        mocks.post.mockResolvedValueOnce({ data: { status: "failed", visiblePassed: 1, visibleTotal: 2, hiddenPassed: 0, hiddenTotal: 0, visibleFailures: [{ name: "duplicate request", message: "expected one operation" }] } });
        render(<CandidateDebuggingRound endpoint={endpoint} headers={headers} />);

        expect(await screen.findByText("Fix duplicate processing.")).toBeTruthy();
        expect(screen.getByTestId("candidate-project").textContent).toContain("src/index.js:buggy");
        fireEvent.click(screen.getByRole("button", { name: "Fix source" }));
        fireEvent.click(screen.getByRole("button", { name: "Run visible tests" }));

        await waitFor(() => expect(mocks.put).toHaveBeenCalledWith(`${endpoint}/workspace`, expect.objectContaining({
            changedFiles: [expect.objectContaining({ path: "src/index.js", content: "fixed" })],
        }), { headers, skipAuthRedirect: true }));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(`${endpoint}/run-tests`, {}, { headers, skipAuthRedirect: true }));
        expect(await screen.findByText(/Visible tests: 1\/2 passed/)).toBeTruthy();
        expect(screen.getByText(/duplicate request: expected one operation/)).toBeTruthy();
    });

    it("never renders hidden test files even if a malformed response includes one", async () => {
        mocks.get.mockResolvedValue({ data: codeWorkspace({
            files: [...baseFiles, { path: "hidden/secret-race.test.js", content: "SECRET_EXPECTED_VALUE", kind: "hidden_test" }],
            baseFiles: [...baseFiles, { path: "hidden/secret-race.test.js", content: "SECRET_EXPECTED_VALUE", kind: "hidden_test" }],
        }) });
        render(<CandidateDebuggingRound endpoint={endpoint} headers={headers} />);
        await screen.findByText("Fix duplicate processing.");
        expect(screen.getByTestId("candidate-project").textContent).not.toMatch(/hidden\/secret|SECRET_EXPECTED_VALUE/);
    });

    it("submits code fixes and displays aggregate hidden results only", async () => {
        const onSubmitted = vi.fn();
        mocks.get.mockResolvedValue({ data: codeWorkspace() });
        mocks.post.mockResolvedValueOnce({ data: { summary: { status: "passed", visiblePassed: 2, visibleTotal: 2, hiddenPassed: 3, hiddenTotal: 3 }, attempt: { _id: "attempt", rounds: [] } } });
        render(<CandidateDebuggingRound endpoint={endpoint} headers={headers} onSubmitted={onSubmitted} />);
        await screen.findByText("Fix duplicate processing.");
        fireEvent.click(screen.getByRole("button", { name: "Submit solution" }));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(`${endpoint}/submit`, {}, { headers, skipAuthRedirect: true }));
        expect(await screen.findByText(/Final result: visible 2\/2, hidden 3\/3/)).toBeTruthy();
        expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ _id: "attempt" }), expect.objectContaining({ hiddenPassed: 3, hiddenTotal: 3 }));
    });

    it("keeps findings projects read-only and submits structured findings without a test run", async () => {
        const findingsWorkspace = {
            responseMode: "findings", runtime: "node-22", instructions: "Diagnose the concurrency defect.",
            baseFiles, files: baseFiles, findings: { rootCause: "", evidence: "", proposedFix: "", impact: "", testingStrategy: "" }, visibleTestRuns: [],
        };
        mocks.get.mockResolvedValue({ data: findingsWorkspace });
        mocks.put.mockImplementation(async (...args) => {
            const body = args[1];
            return { data: { ...findingsWorkspace, findings: body.findings } };
        });
        mocks.post.mockResolvedValueOnce({ data: { summary: { status: "submitted", findings: true }, attempt: { _id: "attempt", rounds: [] } } });
        render(<CandidateDebuggingRound endpoint={endpoint} headers={headers} />);
        await screen.findByText("Diagnose the concurrency defect.");
        expect(screen.getByTestId("candidate-readonly").textContent).toBe("true");
        fireEvent.change(screen.getByLabelText("Root cause"), { target: { value: "Race condition" } });
        fireEvent.change(screen.getByLabelText("Evidence from the code"), { target: { value: "Two requests read pending" } });
        fireEvent.change(screen.getByLabelText("Proposed fix"), { target: { value: "Atomic idempotency update" } });
        fireEvent.change(screen.getByLabelText("Impact / risk"), { target: { value: "Duplicate processing" } });
        fireEvent.change(screen.getByLabelText("Testing strategy"), { target: { value: "Concurrent duplicate requests" } });
        fireEvent.click(screen.getByRole("button", { name: "Submit findings" }));
        await waitFor(() => expect(mocks.put).toHaveBeenCalledWith(`${endpoint}/workspace`, { findings: expect.objectContaining({ rootCause: "Race condition", proposedFix: "Atomic idempotency update", testingStrategy: "Concurrent duplicate requests" }) }, { headers, skipAuthRedirect: true }));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(`${endpoint}/submit`, {}, { headers, skipAuthRedirect: true }));
        expect(mocks.post).not.toHaveBeenCalledWith(`${endpoint}/run-tests`, expect.anything(), expect.anything());
    });
});

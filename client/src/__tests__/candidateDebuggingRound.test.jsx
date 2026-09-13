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
    { path: "src/payment.js", content: "payment", kind: "source" },
];

const codeWorkspace = (overrides = {}) => ({
    responseMode: "code_fix",
    runtime: "node-22",
    instructions: "Fix duplicate processing.",
    baseFiles,
    files: baseFiles,
    testRuns: [],
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
    it("saves a multi-file patch and runs recruiter tests with safe names", async () => {
        mocks.get.mockResolvedValue({ data: codeWorkspace() });
        mocks.post.mockResolvedValueOnce({ data: {
            status: "failed",
            passed: 1,
            total: 2,
            tests: [
                { name: "creates payment once", passed: true },
                { name: "prevents duplicate charge", passed: false },
            ],
        } });
        render(<CandidateDebuggingRound endpoint={endpoint} headers={headers} />);

        expect(await screen.findByText("Fix duplicate processing.")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Fix source" }));
        fireEvent.click(screen.getByRole("button", { name: "Run tests" }));

        await waitFor(() => expect(mocks.put).toHaveBeenCalledWith(`${endpoint}/workspace`, expect.objectContaining({
            changedFiles: [expect.objectContaining({ path: "src/index.js", content: "fixed" })],
        }), { headers, skipAuthRedirect: true }));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(`${endpoint}/run-tests`, {}, { headers, skipAuthRedirect: true }));
        expect(await screen.findByText(/1\/2 tests passed/)).toBeTruthy();
        expect(screen.getByText("creates payment once")).toBeTruthy();
        expect(screen.getByText("prevents duplicate charge")).toBeTruthy();
    });

    it("never renders recruiter test files even if a malformed response includes one", async () => {
        mocks.get.mockResolvedValue({ data: codeWorkspace({
            files: [...baseFiles, { path: "tests/internal.test.js", content: "internal", kind: "hidden_test" }],
            baseFiles: [...baseFiles, { path: "tests/internal.test.js", content: "internal", kind: "hidden_test" }],
        }) });
        render(<CandidateDebuggingRound endpoint={endpoint} headers={headers} />);
        await screen.findByText("Fix duplicate processing.");
        expect(screen.getByTestId("candidate-project").textContent).not.toMatch(/internal\.test|internal/);
    });

    it("submits code fixes and keeps test implementation details out of the result", async () => {
        const onSubmitted = vi.fn();
        mocks.get.mockResolvedValue({ data: codeWorkspace() });
        mocks.post.mockResolvedValueOnce({ data: { summary: { status: "passed", passed: 2, total: 2, tests: [{ name: "creates payment once", passed: true }, { name: "prevents duplicate charge", passed: true }] }, attempt: { _id: "attempt", rounds: [] } } });
        render(<CandidateDebuggingRound endpoint={endpoint} headers={headers} onSubmitted={onSubmitted} />);
        await screen.findByText("Fix duplicate processing.");
        fireEvent.click(screen.getByRole("button", { name: "Submit solution" }));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(`${endpoint}/submit`, {}, { headers, skipAuthRedirect: true }));
        expect(await screen.findByText(/Final result: 2\/2 tests passed/)).toBeTruthy();
        expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ _id: "attempt" }), expect.objectContaining({ passed: 2, total: 2 }));
    });

    it("shows findings beside the project and associates every finding with a project file", async () => {
        const findingsWorkspace = {
            responseMode: "findings",
            runtime: "node-22",
            instructions: "Diagnose the concurrency defect.",
            baseFiles,
            files: baseFiles,
            findings: [],
            testRuns: [],
        };
        mocks.get.mockResolvedValue({ data: findingsWorkspace });
        mocks.put.mockImplementation(async (_url, body) => ({ data: { ...findingsWorkspace, findings: body.findings } }));
        mocks.post.mockResolvedValueOnce({ data: { summary: { status: "submitted", findings: true }, attempt: { _id: "attempt", rounds: [] } } });

        render(<CandidateDebuggingRound endpoint={endpoint} headers={headers} />);
        await screen.findByText("Diagnose the concurrency defect.");
        expect(screen.getByTestId("candidate-readonly").textContent).toBe("true");
        expect(screen.getByText("Findings by file")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Add finding" }));
        fireEvent.mouseDown(screen.getByLabelText("Finding file"));
        fireEvent.click(screen.getByRole("option", { name: "src/payment.js" }));
        fireEvent.change(screen.getByLabelText("Finding / root cause"), { target: { value: "Two requests can charge the same order." } });
        fireEvent.change(screen.getByLabelText("Proposed fix"), { target: { value: "Make the idempotency transition atomic." } });
        fireEvent.click(screen.getByRole("button", { name: "Submit findings" }));

        await waitFor(() => expect(mocks.put).toHaveBeenCalledWith(`${endpoint}/workspace`, {
            findings: [expect.objectContaining({
                filePath: "src/payment.js",
                rootCause: "Two requests can charge the same order.",
                proposedFix: "Make the idempotency transition atomic.",
            })],
        }, { headers, skipAuthRedirect: true }));
        expect(mocks.post).not.toHaveBeenCalledWith(`${endpoint}/run-tests`, expect.anything(), expect.anything());
    });
});

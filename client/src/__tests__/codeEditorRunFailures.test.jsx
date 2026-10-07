import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CodeEditorField from "../components/CodeEditorField";

const { post, publicConfig } = vi.hoisted(() => ({ post: vi.fn(), publicConfig: { features: { codeExecution: true } } }));
vi.mock("../api/axios", () => ({ default: { post } }));
vi.mock("../hooks/usePublicConfig", () => ({ default: () => publicConfig }));
vi.mock("react-monaco-editor", () => ({
    default: ({ value, onChange }) => <textarea aria-label="Code editor" value={value || ""} onChange={(event) => onChange?.(event.target.value)} />,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const renderEditor = (props = {}) => render(
    <CodeEditorField value="console.log(1)" onChange={vi.fn()} suggestCode questionText="Implement a function" {...props} />,
);

describe("CodeEditorField run failures", () => {
    it("shows why a run failed instead of an empty output box", async () => {
        post.mockRejectedValueOnce({ response: { status: 503, data: { message: "Feature disabled" } }, message: "Request failed with status code 503" });
        renderEditor({ canRun: true });

        fireEvent.click(screen.getByRole("button", { name: /^run$/i }));

        expect(await screen.findByText("Run failed")).toBeTruthy();
        expect(screen.getByDisplayValue(/Code execution is unavailable right now/)).toBeTruthy();
    });

    it("uses the server's message for other failures", async () => {
        post.mockRejectedValueOnce({ response: { status: 400, data: { message: "Unsupported language" } }, message: "Request failed with status code 400" });
        renderEditor({ canRun: true });

        fireEvent.click(screen.getByRole("button", { name: /^run$/i }));

        expect(await screen.findByDisplayValue("Unsupported language")).toBeTruthy();
    });

    it("hides Run and stdin when code execution is unavailable", () => {
        renderEditor({ canRun: false });

        expect(screen.queryByRole("button", { name: /^run$/i })).toBeNull();
        expect(screen.queryByPlaceholderText("Input for your code (stdin)")).toBeNull();
        expect(screen.getByRole("button", { name: /fullscreen/i })).toBeTruthy();
    });

    it("follows the server's code-execution setting when the caller doesn't decide", () => {
        publicConfig.features.codeExecution = false;
        renderEditor();
        expect(screen.queryByRole("button", { name: /^run$/i })).toBeNull();
        cleanup();

        publicConfig.features.codeExecution = true;
        renderEditor();
        expect(screen.getByRole("button", { name: /^run$/i })).toBeTruthy();
    });
});

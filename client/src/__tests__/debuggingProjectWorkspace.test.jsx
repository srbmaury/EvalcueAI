import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DebuggingProjectWorkspace from "../components/DebuggingProjectWorkspace";

vi.mock("react-monaco-editor", () => ({
    default: ({ value, onChange, options }) => (
        <textarea
            aria-label="Project code editor"
            value={value || ""}
            readOnly={Boolean(options?.readOnly)}
            onChange={(event) => onChange?.(event.target.value)}
        />
    ),
}));

afterEach(() => cleanup());

const files = [
    { path: "src/index.js", content: "const buggy = true;", kind: "source" },
    { path: "tests/index.test.js", content: "visible", kind: "visible_test" },
    { path: "hidden/secret.test.js", content: "secret", kind: "hidden_test" },
];

describe("DebuggingProjectWorkspace", () => {
    it("creates files and folders as immutable file-array changes", () => {
        const onFilesChange = vi.fn();
        render(<DebuggingProjectWorkspace files={files} onFilesChange={onFilesChange} allowClassification />);

        fireEvent.change(screen.getByLabelText("New file path"), { target: { value: "src/helper.js" } });
        fireEvent.click(screen.getByRole("button", { name: "New file" }));
        expect(onFilesChange).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ path: "src/helper.js", kind: "source", content: "" }),
        ]));

        fireEvent.change(screen.getByLabelText("New folder path"), { target: { value: "src/services" } });
        fireEvent.click(screen.getByRole("button", { name: "New folder" }));
        expect(onFilesChange).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ path: "src/services/.gitkeep", kind: "source" }),
        ]));
    });

    it("renames, classifies, and edits the selected source file", () => {
        const onFilesChange = vi.fn();
        render(<DebuggingProjectWorkspace files={files} onFilesChange={onFilesChange} allowClassification />);

        fireEvent.change(screen.getByLabelText("Rename path"), { target: { value: "src/payment.js" } });
        fireEvent.click(screen.getByLabelText("Rename selected file"));
        expect(onFilesChange).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ path: "src/payment.js", content: "const buggy = true;", kind: "source" }),
        ]));

        fireEvent.mouseDown(screen.getByLabelText("File type"));
        fireEvent.click(screen.getByRole("option", { name: "Visible test" }));
        expect(onFilesChange).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ path: "src/index.js", kind: "visible_test" }),
        ]));

        fireEvent.change(screen.getByLabelText("Project code editor"), { target: { value: "const buggy = false;" } });
        expect(onFilesChange).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ path: "src/index.js", content: "const buggy = false;", kind: "source" }),
        ]));
    });

    it("keeps hidden tests out of candidate trees and protects visible tests", () => {
        const onFilesChange = vi.fn();
        render(<DebuggingProjectWorkspace files={files} onFilesChange={onFilesChange} hideHidden protectTests />);

        expect(screen.queryByText("hidden/secret.test.js")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /tests\/index\.test\.js/ }));
        expect(screen.getByLabelText("Project code editor").readOnly).toBe(true);
        expect(screen.queryByLabelText("Delete selected file")).toBeNull();
        expect(screen.getByText("Test files are read-only in the candidate workspace.")).toBeTruthy();
    });
});

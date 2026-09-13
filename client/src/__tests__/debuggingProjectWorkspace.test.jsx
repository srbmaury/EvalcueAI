import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DebuggingProjectWorkspace from "../components/DebuggingProjectWorkspace";

vi.mock("react-monaco-editor", () => ({
    default: ({ value, onChange, options }) => <textarea aria-label="Project code editor" value={value || ""} readOnly={Boolean(options?.readOnly)} onChange={(event) => onChange?.(event.target.value)} />,
}));

afterEach(() => cleanup());

const files = [
    { path: "src/index.js", content: "const buggy = true;", kind: "source" },
    { path: "src/payment.js", content: "payment", kind: "source" },
    { path: "tests/duplicate.test.js", content: "internal", kind: "hidden_test", displayName: "prevents duplicate charge" },
];

describe("DebuggingProjectWorkspace", () => {
    it("renders project paths as a hierarchical folder tree", () => {
        const projectFiles = [
            { path: "demo/src.js", content: "demo", kind: "source" },
            { path: "src/index.js", content: "index", kind: "source" },
            { path: "src/services/payment.js", content: "payment", kind: "source" },
        ];
        render(<DebuggingProjectWorkspace files={projectFiles} readOnly />);

        const demoFolder = screen.getByTestId("project-folder:demo");
        expect(within(demoFolder).getByText("demo")).toBeTruthy();
        expect(within(demoFolder).getByRole("button", { name: "demo/src.js" })).toBeTruthy();
        expect(within(demoFolder).queryByRole("button", { name: "src/index.js" })).toBeNull();

        const srcFolder = screen.getByTestId("project-folder:src");
        expect(within(srcFolder).getByRole("button", { name: "src/index.js" })).toBeTruthy();
        const servicesFolder = within(srcFolder).getByTestId("project-folder:src/services");
        expect(within(servicesFolder).getByText("services")).toBeTruthy();
        expect(within(servicesFolder).getByRole("button", { name: "src/services/payment.js" })).toBeTruthy();

        expect(screen.queryByText("demo/src.js")).toBeNull();
        expect(screen.queryByText("src/index.js")).toBeNull();
        expect(screen.queryByText("src/services/payment.js")).toBeNull();
    });

    it("creates files and folders as immutable file-array changes", () => {
        const onFilesChange = vi.fn();
        render(<DebuggingProjectWorkspace files={files} onFilesChange={onFilesChange} allowClassification />);

        fireEvent.change(screen.getByLabelText("New file path"), { target: { value: "src/helper.js" } });
        fireEvent.click(screen.getByRole("button", { name: "New file" }));
        expect(onFilesChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ path: "src/helper.js", kind: "source", content: "" })]));

        fireEvent.change(screen.getByLabelText("New folder path"), { target: { value: "src/services" } });
        fireEvent.click(screen.getByRole("button", { name: "New folder" }));
        expect(onFilesChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ path: "src/services/.gitkeep", kind: "source" })]));
    });

    it("renames, marks hidden tests, names them safely, and edits source", () => {
        const onFilesChange = vi.fn();
        render(<DebuggingProjectWorkspace files={files} onFilesChange={onFilesChange} allowClassification />);

        fireEvent.change(screen.getByLabelText("Rename path"), { target: { value: "src/order.js" } });
        fireEvent.click(screen.getByLabelText("Rename selected file"));
        expect(onFilesChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ path: "src/order.js", content: "const buggy = true;", kind: "source" })]));

        fireEvent.mouseDown(screen.getByLabelText("File type"));
        fireEvent.click(screen.getByRole("option", { name: "Hidden test" }));
        expect(onFilesChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ path: "src/index.js", kind: "hidden_test" })]));

        fireEvent.click(screen.getByRole("button", { name: "tests/duplicate.test.js" }));
        fireEvent.change(screen.getByLabelText("Candidate-visible test name"), { target: { value: "charges once" } });
        expect(onFilesChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ path: "tests/duplicate.test.js", kind: "hidden_test", displayName: "charges once" })]));

        fireEvent.click(screen.getByRole("button", { name: "src/payment.js" }));
        fireEvent.change(screen.getByLabelText("Project code editor"), { target: { value: "fixed payment" } });
        expect(onFilesChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ path: "src/payment.js", content: "fixed payment", kind: "source" })]));
    });

    it("keeps recruiter tests out of candidate trees", () => {
        render(<DebuggingProjectWorkspace files={files} hideHidden readOnly />);
        expect(screen.queryByRole("button", { name: "tests/duplicate.test.js" })).toBeNull();
        expect(screen.getByRole("button", { name: "src/index.js" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "src/payment.js" })).toBeTruthy();
    });
});

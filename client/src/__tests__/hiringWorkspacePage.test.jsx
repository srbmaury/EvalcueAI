import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import HiringWorkspacePage from "../pages/HiringWorkspacePage";

vi.mock("../pages/AssessmentBuilderPage", () => ({ default: () => <div>Guided assessment builder</div> }));
vi.mock("../pages/AssessmentsPage", () => ({ default: () => <div>Assessment workspace</div> }));

afterEach(cleanup);

const renderPath = (path) => render(
    <MemoryRouter initialEntries={[path]}>
        <HiringWorkspacePage />
    </MemoryRouter>,
);

describe("HiringWorkspacePage", () => {
    it("uses the guided builder for new assessments", () => {
        renderPath("/hire/assessments?create=1");
        expect(screen.getByText("Guided assessment builder")).toBeTruthy();
    });

    it("uses the same guided builder when editing a draft", () => {
        renderPath("/hire/assessments?create=1&edit=a1");
        expect(screen.getByText("Guided assessment builder")).toBeTruthy();
    });

    it("shows the assessment workspace when not building", () => {
        renderPath("/hire/assessments");
        expect(screen.getByText("Assessment workspace")).toBeTruthy();
    });
});

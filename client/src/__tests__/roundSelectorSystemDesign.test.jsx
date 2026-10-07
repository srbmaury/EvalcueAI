import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RoundsSelector from "../components/RoundSelector";
import { SYSTEM_DESIGN_FORMAT, isSystemDesignRound, systemDesignDescription } from "../utils/roundDefaults";

const planned = { roundName: "Distributed Systems and Scalability", description: "Discuss partitioning, load balancing, and fault tolerance.", deliveryMode: "conversational", questionLimit: 4 };

// Mirrors CreateInterviewPage's handlers so the selector is exercised with real state updates.
function Harness({ onRounds }) {
    const [rounds, setRounds] = useState([planned]);
    const update = (next) => { setRounds(next); onRounds(next); };
    const onChangeMode = (name, mode) => update(rounds.map((r) => {
        if (r.roundName !== name) return r;
        const baseDescription = r.baseDescription ?? r.description;
        if (mode === SYSTEM_DESIGN_FORMAT) return { ...r, deliveryMode: "conversational", baseDescription, description: systemDesignDescription(baseDescription), questionLimit: 1 };
        const { baseDescription: _previous, ...rest } = r;
        return { ...rest, deliveryMode: mode, description: baseDescription };
    }));
    const onChangeCount = (name, questionLimit) => setRounds((prev) => prev.map((r) => r.roundName === name ? { ...r, questionLimit } : r));
    return <RoundsSelector suggestedRounds={[planned]} selectedRounds={rounds} onToggleRound={() => {}} onChangeMode={onChangeMode} onChangeCount={onChangeCount} />;
}

const choose = (label) => {
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Interview format" }));
    fireEvent.click(within(screen.getByRole("listbox")).getByText(label));
};

describe("practice round format menu", () => {
    it("offers live system design for an AI-planned conversation round, and can switch back", () => {
        let latest = [planned];
        render(<Harness onRounds={(next) => { latest = next; }} />);

        choose("Live system design (whiteboard)");
        expect(isSystemDesignRound(latest[0])).toBe(true);
        expect(latest[0].questionLimit).toBe(1);
        expect(screen.getByRole("combobox", { name: "Interview format" }).textContent).toMatch(/Live system design/);

        choose("Live conversation (adaptive)");
        expect(latest[0].description).toBe(planned.description);
        expect(isSystemDesignRound(latest[0])).toBe(false);
    });
});

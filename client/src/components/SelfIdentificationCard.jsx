import { useState } from "react";
import { Alert, Button, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography } from "@mui/material";
import api from "../api/axios";
import { RACE_ETHNICITY_OPTIONS, SEX_OPTIONS } from "../utils/selfIdentification";

// Voluntary, shown only after submission. Answers are never shown to reviewers or used in scoring; the hiring
// team only sees anonymous group totals used to check the process for adverse impact.
export default function SelfIdentificationCard({ endpoint, headers }) {
    const [sex, setSex] = useState("");
    const [raceEthnicity, setRaceEthnicity] = useState("");
    const [state, setState] = useState("idle");

    const save = async () => {
        setState("saving");
        try {
            await api.put(endpoint, { sex, raceEthnicity }, { headers, skipAuthRedirect: true });
            setState("saved");
        } catch {
            setState("error");
        }
    };

    if (state === "saved") return <Alert severity="success">Thank you. Your answers were saved anonymously.</Alert>;
    if (state === "skipped") return null;

    const choice = (id, label, value, setValue, options) => (
        <FormControl fullWidth size="small">
            <InputLabel id={`${id}-label`}>{label}</InputLabel>
            <Select labelId={`${id}-label`} id={id} label={label} value={value} onChange={(event) => setValue(event.target.value)}>
                <MenuItem value="">Prefer not to say</MenuItem>
                {options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </Select>
        </FormControl>
    );

    return (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "left" }}>
            <Stack spacing={2}>
                <div>
                    <Typography component="h2" variant="h6" fontWeight={800}>Optional: voluntary self-identification</Typography>
                    <Typography variant="body2" color="text.secondary" mt={.75}>
                        Your assessment is already submitted. These answers are not shown to reviewers, do not affect how your assessment is evaluated, and
                        are only counted in anonymous totals that help the hiring team check that the process treats every group fairly.
                    </Typography>
                </div>
                {choice("self-id-sex", "Sex", sex, setSex, SEX_OPTIONS)}
                {choice("self-id-race", "Race / ethnicity", raceEthnicity, setRaceEthnicity, RACE_ETHNICITY_OPTIONS)}
                {state === "error" && <Alert severity="error">Could not save your answers. You can try again or skip.</Alert>}
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button onClick={() => setState("skipped")} disabled={state === "saving"}>Skip</Button>
                    <Button variant="contained" onClick={save} disabled={state === "saving" || (!sex && !raceEthnicity)}>
                        {state === "saving" ? "Saving…" : "Submit anonymously"}
                    </Button>
                </Stack>
            </Stack>
        </Paper>
    );
}

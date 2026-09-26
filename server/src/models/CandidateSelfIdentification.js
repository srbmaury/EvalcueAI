import mongoose from "mongoose";

// Voluntary demographic self-identification, stored apart from the attempt so it never appears in reviewer
// views, candidate payloads, or AI prompts. It is only read in aggregate by the adverse-impact report.
export const SEX_CATEGORIES = Object.freeze(["female", "male", "nonbinary"]);
export const RACE_ETHNICITY_CATEGORIES = Object.freeze([
    "hispanic_latino",
    "white",
    "black_african_american",
    "asian",
    "native_hawaiian_pacific_islander",
    "american_indian_alaska_native",
    "two_or_more",
]);

const candidateSelfIdentificationSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    assessment: { type: mongoose.Schema.Types.ObjectId, ref: "Assessment", required: true, index: true },
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: "CandidateAttempt", required: true, unique: true },
    // "" means the candidate chose not to answer that question.
    sex: { type: String, enum: ["", ...SEX_CATEGORIES], default: "" },
    raceEthnicity: { type: String, enum: ["", ...RACE_ETHNICITY_CATEGORIES], default: "" },
}, { timestamps: true });

export default mongoose.model("CandidateSelfIdentification", candidateSelfIdentificationSchema);

// Mirrors server/src/models/CandidateSelfIdentification.js. EEO-1 style categories; "" means not answered.
export const SEX_OPTIONS = [
    { value: "female", label: "Female" },
    { value: "male", label: "Male" },
    { value: "nonbinary", label: "Non-binary" },
];

export const RACE_ETHNICITY_OPTIONS = [
    { value: "hispanic_latino", label: "Hispanic or Latino" },
    { value: "white", label: "White" },
    { value: "black_african_american", label: "Black or African American" },
    { value: "asian", label: "Asian" },
    { value: "native_hawaiian_pacific_islander", label: "Native Hawaiian or Other Pacific Islander" },
    { value: "american_indian_alaska_native", label: "American Indian or Alaska Native" },
    { value: "two_or_more", label: "Two or more races" },
];

const LABELS = Object.fromEntries([...SEX_OPTIONS, ...RACE_ETHNICITY_OPTIONS].map((option) => [option.value, option.label]));

export const selfIdentificationLabel = (key = "") => key.split("|").map((part) => LABELS[part] || part).join(" · ");

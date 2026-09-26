const STOP_WORDS = new Set([
    "about", "after", "also", "and", "are", "been", "being", "but", "can", "company", "could", "each", "from", "have", "into", "job", "more", "must", "our", "role", "should", "that", "the", "their", "them", "then", "they", "this", "through", "using", "very", "what", "when", "where", "which", "while", "will", "with", "work", "would", "years", "you", "your",
    // Generic job-posting vocabulary that is not a skill, so it should neither count as a match nor show up as a gap.
    "ability", "across", "build", "building", "candidate", "deliver", "develop", "developing", "domain", "engineer", "engineers",
    "ensure", "excellent", "experience", "for", "good", "great", "help", "improve", "including", "join", "junior", "knowledge",
    "looking", "operate", "own", "plus", "preferred", "required", "requirements", "responsibilities", "responsible", "senior",
    "skills", "strong", "team", "teams", "understanding", "within", "working",
]);

const normalize = (value = "") => value.toLowerCase()
    .replace(/c\+\+/g, "cplusplus").replace(/c#/g, "csharp").replace(/\.net/g, " dotnet ")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

const terms = (value) => normalize(value).split(" ").filter((term) => term.length >= 3 && !STOP_WORDS.has(term) && !/^\d+$/.test(term));

const jobKeywords = (jobDescription, role = "") => {
    const source = terms(`${role} ${role} ${jobDescription}`);
    const frequency = new Map();
    source.forEach((term) => frequency.set(term, (frequency.get(term) || 0) + 1));
    return [...frequency.entries()]
        .map(([term, count]) => ({ term, weight: Math.min(1 + (count - 1) * .35 + (term.length >= 8 ? .2 : 0), 2.4) }))
        .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term))
        .slice(0, 80);
};

const evidenceFor = (text, matched) => {
    const wanted = new Set(matched.slice(0, 10));
    return String(text || "").split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter((line) => {
        const lineTerms = new Set(terms(line));
        return [...wanted].some((term) => lineTerms.has(term));
    }).sort((a, b) => {
        const hits = (line) => { const lineTerms = new Set(terms(line)); return [...wanted].filter((term) => lineTerms.has(term)).length; };
        return hits(b) - hits(a);
    }).slice(0, 3).map((line) => line.slice(0, 240));
};

export function rankResumesForJob(resumes, { jobDescription, role = "" }) {
    const keywords = jobKeywords(jobDescription, role);
    const totalWeight = keywords.reduce((sum, keyword) => sum + keyword.weight, 0) || 1;
    return resumes.map((resume) => {
        const resumeTerms = new Set(terms(`${resume.fileName} ${(resume.tags || []).join(" ")} ${resume.notes || ""} ${resume.extractedText || ""}`));
        const matched = keywords.filter(({ term }) => resumeTerms.has(term));
        const missing = keywords.filter(({ term }) => !resumeTerms.has(term));
        const matchedWeight = matched.reduce((sum, keyword) => sum + keyword.weight, 0);
        const score = Math.min(100, Math.round(matchedWeight / totalWeight * 100));
        const matchedTerms = matched.map(({ term }) => term);
        return {
            resumeId: String(resume._id),
            fileName: resume.fileName,
            score,
            matchedKeywords: matchedTerms.slice(0, 20),
            missingKeywords: missing.map(({ term }) => term).slice(0, 12),
            evidence: evidenceFor(resume.extractedText, matchedTerms),
            updatedAt: resume.updatedAt || resume.createdAt,
        };
    }).sort((a, b) => b.score - a.score || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

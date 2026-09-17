import Resume from "../models/Resume.js";
import { generateJSON } from "../utils/generateQuestions/aiClient.js";
import { buildResumeLatex } from "../utils/resumeLatexTemplate.js";
import { compileLatexToPdf, LatexCompileError } from "../utils/compileLatex.js";

const MAX_COMPILE_ATTEMPTS = 3;
// Below this, the page reads as sparse/unfinished rather than like a deliberately short
// one-page resume — measured from the compiled PDF's actual text position, not guessed.
const MIN_FILL_FRACTION = 0.75;

const clampString = (value, max) => (value || "").toString().trim().slice(0, max);
const clampArray = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);

// Same defensive normalization style as reviewResume: never trust AI output's shape,
// size, or types directly — cap every array and string length before it's used for
// anything, including before it reaches the LaTeX builder.
const normalizeContent = (input) => {
    const parsed = input || {};
    return {
        name: clampString(parsed.name, 120),
        contact: {
            phone: clampString(parsed.contact?.phone, 40),
            email: clampString(parsed.contact?.email, 254),
            linkedin: clampString(parsed.contact?.linkedin, 300),
            linkedinLabel: clampString(parsed.contact?.linkedinLabel, 120),
            github: clampString(parsed.contact?.github, 300),
            githubLabel: clampString(parsed.contact?.githubLabel, 120),
            website: clampString(parsed.contact?.website, 300),
            websiteLabel: clampString(parsed.contact?.websiteLabel, 120),
        },
        summary: clampString(parsed.summary, 400),
        experience: clampArray(parsed.experience, 5).map((item) => ({
            title: clampString(item?.title, 150),
            dateRange: clampString(item?.dateRange, 60),
            organization: clampString(item?.organization, 150),
            location: clampString(item?.location, 100),
            bullets: clampArray(item?.bullets, 6).map((bullet) => clampString(bullet, 260)).filter(Boolean),
            tech: clampString(item?.tech, 200),
        })).filter((item) => item.title),
        projects: clampArray(parsed.projects, 4).map((item) => ({
            name: clampString(item?.name, 120),
            links: clampArray(item?.links, 3).map((link) => ({ label: clampString(link?.label, 40), url: clampString(link?.url, 300) })).filter((link) => link.label),
            bullets: clampArray(item?.bullets, 5).map((bullet) => clampString(bullet, 260)).filter(Boolean),
            tech: clampString(item?.tech, 200),
        })).filter((item) => item.name),
        education: clampArray(parsed.education, 3).map((item) => ({
            institution: clampString(item?.institution, 150),
            dateRange: clampString(item?.dateRange, 60),
            detail: clampString(item?.detail, 200),
        })).filter((item) => item.institution),
        skills: clampArray(parsed.skills, 6).map((item) => ({ category: clampString(item?.category, 60), items: clampString(item?.items, 300) })).filter((item) => item.category && item.items),
        achievements: clampArray(parsed.achievements, 6).map((item) => clampString(item, 200)).filter(Boolean),
    };
};

const generationSchema = `Return ONLY JSON with this exact shape:
{
  "name": string,
  "contact": { "phone": string, "email": string, "linkedin": string, "github": string, "website": string },
  "summary": string, // 1-2 sentences, tailored to the job
  "experience": [{ "title": string, "dateRange": string, "organization": string, "location": string, "bullets": string[], "tech": string }],
  "projects": [{ "name": string, "links": [{ "label": string, "url": string }], "bullets": string[], "tech": string }],
  "education": [{ "institution": string, "dateRange": string, "detail": string }],
  "skills": [{ "category": string, "items": string }],
  "achievements": string[]
}
No markdown, no code fences. Every bullet must be something the resume text actually supports — never invent experience, employers, dates, or metrics that aren't in the source resume. This applies to contact details too: if a phone, email, LinkedIn, GitHub, or website isn't present in the source resume text, leave that field as an empty string rather than inventing a placeholder.`;

const buildGenerationPrompt = ({ role, jobDescription, resumeText }) => `You are an expert resume writer preparing a one-page, ATS-friendly resume tailored to a specific job.
Rewrite content from the candidate's existing resume to emphasize what's most relevant to the target role and job description, reordering and rephrasing for impact. Include every experience entry, project, and piece of education that appears in the source resume and is genuinely relevant — do not omit or shorten things preemptively to save space. Write full, substantive bullets (not one-line fragments) and quantify impact where the source resume supports it. A resume that only fills half a page reads as thin and unfinished; use the space. If this later turns out to be too long for one page, it will be shortened in a follow-up pass — so favor completeness now over brevity.

${generationSchema}

TARGET ROLE: ${role || "(not provided)"}
JOB DESCRIPTION: ${jobDescription || "(not provided)"}
CANDIDATE RESUME TEXT: ${resumeText}`;

const buildCondensePrompt = (previousContent) => `The following resume content compiled to more than one page. Shorten it so it fits on a single page: remove the least relevant bullets, projects, or experience entries first, then tighten remaining wording. Keep the same JSON shape and keep everything truthful to the original content — do not invent anything new.

${generationSchema}

CURRENT CONTENT: ${JSON.stringify(previousContent)}`;

// Symmetric to the condense pass above: the compiled page came back with a lot of unused
// space at the bottom (measured from the actual PDF, not guessed), so pull in more real
// material from the source resume rather than padding existing bullets with filler.
const buildExpandPrompt = (previousContent, resumeText) => `The following resume content compiled to a single page, but with a lot of empty space at the bottom — it needs more content, not padding or filler wording. Go back to the full candidate resume text below and add back genuinely relevant experience, projects, education, skills, or achievements that were left out, and expand existing bullets with more real detail (additional responsibilities, tools, or outcomes the source resume actually mentions). Do not invent anything not supported by the source resume text, and do not just lengthen sentences with vague filler to take up space.

${generationSchema}

CURRENT CONTENT: ${JSON.stringify(previousContent)}

FULL CANDIDATE RESUME TEXT: ${resumeText}`;

const parseAiJson = async (prompt) => {
    const raw = await generateJSON(prompt);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
};

export const generateTailoredResume = async (req, res, next) => {
    try {
        const { role, jobDescription } = req.body || {};
        const resume = await Resume.findOne({ _id: req.params.id, user: req.user._id });
        if (!resume) return res.status(404).json({ message: "Resume not found" });

        const resumeText = clampString(resume.extractedText, 30000);
        const safeRole = clampString(role, 200);
        const safeJD = clampString(jobDescription, 12000);

        let content = normalizeContent(await parseAiJson(buildGenerationPrompt({ role: safeRole, jobDescription: safeJD, resumeText })));
        if (!content.experience.length && !content.projects.length) {
            return res.status(503).json({ message: "The tailored resume could not be generated right now. Please try again." });
        }

        let pdfBuffer;
        let pageCount = Infinity;
        for (let attempt = 1; attempt <= MAX_COMPILE_ATTEMPTS; attempt += 1) {
            let compiled;
            try {
                compiled = await compileLatexToPdf(buildResumeLatex(content));
            } catch (error) {
                if (error instanceof LatexCompileError) {
                    return res.status(error.unavailable ? 503 : 422).json({ message: error.message });
                }
                throw error;
            }
            pdfBuffer = compiled.pdfBuffer;
            pageCount = compiled.pageCount;
            if (attempt === MAX_COMPILE_ATTEMPTS) break;

            if (pageCount > 1) {
                const condensed = await parseAiJson(buildCondensePrompt(content));
                if (!condensed) break;
                content = normalizeContent(condensed);
                continue;
            }
            // fillFraction is a real measurement of the compiled PDF (see
            // firstPageFillFraction), not a guess — null just means it couldn't be
            // measured, in which case there's nothing reliable to act on.
            if (compiled.fillFraction !== null && compiled.fillFraction < MIN_FILL_FRACTION) {
                const expanded = await parseAiJson(buildExpandPrompt(content, resumeText));
                if (!expanded) break;
                content = normalizeContent(expanded);
                continue;
            }
            break;
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=\"tailored-resume.pdf\"");
        res.setHeader("X-Resume-Page-Count", String(pageCount));
        return res.send(pdfBuffer);
    } catch (error) {
        console.error("Generate tailored resume error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

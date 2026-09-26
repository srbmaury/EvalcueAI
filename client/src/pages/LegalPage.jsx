import { Box, Container, Link, Paper, Stack, Typography } from "@mui/material";
import SiteFooter from "../components/SiteFooter";
import { publicSupportEmail } from "../utils/publicContact";

const privacySections = [
    ["What we collect", "Account details, resumes and extracted text, target-role information, interview and candidate-assessment answers, audio submitted for transcription, generated feedback, and security/operational logs."],
    ["How it is used", "We use this information to provide personalized interview practice, resume feedback, authentication, abuse prevention, support, and service reliability."],
    ["Service providers", "Depending on enabled features, content may be processed by configured AI providers such as OpenAI or Google Gemini, Cloudinary for resume storage, Tavily for web research, and monitoring or email providers. Submitted code runs on our own isolated code-execution service. When you answer by voice, recorded audio is transcribed by our configured speech-to-text provider (currently OpenAI), and your browser's built-in speech recognition may also process it to show live text; in Chrome, for example, that audio is sent to Google's speech service."],
    ["Retention and control", "Data remains until you delete individual resumes or delete your account. Account deletion removes account records, interviews, answers, feedback, resumes, and active sessions. Provider backups and operational logs may take additional time to expire."],
    ["Your choices", "Do not upload information you do not want processed. You can delete resumes from your profile and permanently delete your account and associated personal data from the profile danger zone."],
    ["Candidate assessments", "When you complete an assessment shared by a recruiting team, your name, email, answers, AI-generated scores, feedback, and any consented integrity events are available to the assessment owner. Optional face-presence checks run on your device; camera frames are not stored or uploaded. Candidates receive submission confirmation but do not receive the private evaluation report."],
    ["Security", "We use access controls, encrypted transport, short-lived sessions, rate limits, audit logging, and file validation. No online service can guarantee absolute security."],
];

const termsSections = [
    ["Service", "EvalcueAI provides practice questions and AI-generated feedback for educational purposes. It does not guarantee interviews, offers, scores, or employment outcomes."],
    ["Acceptable use", "Do not misuse the service, access another person’s data, evade limits, upload malicious files, or use code execution to attack systems."],
    ["Your content", "You retain ownership of content you submit and grant the service the limited permission needed to process it and provide the requested features."],
    ["AI limitations", "AI output can be inaccurate, incomplete, or biased. Assessment owners must review reports independently and must not use AI feedback as the sole basis for a hiring decision."],
    ["Availability and accounts", "Features and limits may change. Accounts that create security, legal, or operational risk may be suspended. You may delete your account at any time."],
];

export default function LegalPage({ type }) {
    const privacy = type === "privacy";
    const sections = privacy ? privacySections : termsSections;
    return (
        <>
            <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
                <Paper variant="outlined" sx={{ p: { xs: 3, md: 6 }, borderRadius: 4 }}>
                    <Typography variant="overline" color="primary.main" fontWeight={800}>EvalcueAI</Typography>
                    <Typography component="h1" variant="h3" fontWeight={800} mt={1}>{privacy ? "Privacy notice" : "Terms of use"}</Typography>
                    <Typography color="text.secondary" mt={1}>Effective August 1, 2026</Typography>
                    <Stack spacing={4} mt={5}>
                        {sections.map(([title, body]) => <Box key={title}><Typography component="h2" variant="h6" fontWeight={750}>{title}</Typography><Typography color="text.secondary" mt={1} lineHeight={1.75}>{body}</Typography></Box>)}
                        <Box>
                            <Typography component="h2" variant="h6" fontWeight={750}>Questions</Typography>
                            <Typography color="text.secondary" mt={1}>
                                {publicSupportEmail ? <>Contact <Link href={`mailto:${publicSupportEmail}`}>{publicSupportEmail}</Link>.</> : "Contact the support channel provided by your EvalcueAI deployment administrator."}
                            </Typography>
                        </Box>
                    </Stack>
                </Paper>
            </Container>
            <SiteFooter />
        </>
    );
}

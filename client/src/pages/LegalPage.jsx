import PublicSiteFrame from "../components/PublicSiteFrame";
import { Box, Container, Link, Paper, Stack, Typography } from "@mui/material";
import { BUSINESS_LEGAL_NAME } from "../utils/brandEntity";
import SiteFooter from "../components/SiteFooter";
import { publicSupportEmail } from "../utils/publicContact";

const privacySections = [
    ["Scope and operator", "This policy explains how SAURABH MAURYA, operating EvalcueAI, handles personal information when you use our website, interview practice, resume tools, and technical hiring assessments. For assessments arranged by an employer, the recruiting organization also determines how it uses candidate information; contact that organization about its recruitment records and decisions."],
    ["Information we collect", "We process account and contact details, authentication information, resumes and extracted text, target-role information, interview answers, submitted code, assessment results, generated feedback, and audio you submit for transcription. We also process service usage, security and operational logs, and billing status when you purchase a plan. Please avoid submitting unnecessary sensitive information or personal information belonging to others."],
    ["Why we process information", "Account information supports authentication, account administration, and support. Resumes, role details, answers, and code enable the practice, resume, and assessment features you request. Audio enables transcription. Usage and security records support plan limits, abuse prevention, troubleshooting, and service reliability. Billing information supports checkout, subscription management, and invoices."],
    ["Service providers and payments", "Depending on the features you use, content may be processed by configured AI providers such as OpenAI or Google Gemini, Cloudinary for resume storage, Tavily for web research, and email or monitoring providers. PayU processes payments and recurring mandates; payment details entered into its checkout are handled by PayU. Submitted code runs on our isolated code-execution service. These providers may process information in countries other than your own, subject to their terms and privacy practices."],
    ["Voice and device permissions", "When you answer by voice, recorded audio is transcribed by our configured speech-to-text provider, currently OpenAI. Your browser’s built-in speech recognition may also process audio to display live text; Chrome may send this audio to Google’s speech service. Microphone and camera access require browser permission. You can revoke these permissions in your browser settings and use supported text-based alternatives."],
    ["Recruiting assessments", "When you complete an assessment shared by a recruiting team, your name, email, answers, AI-generated scores, feedback, and any consented integrity events are available to the assessment owner. Optional face-presence checks run on your device; camera frames are not stored or uploaded. Candidates receive submission confirmation; private evaluation reports are available to the recruiting team. Questions about recruitment decisions or employer-held copies should be directed to that team."],
    ["Retention and deletion", "You can delete individual resumes and request permanent account deletion from your profile. Account deletion removes account records and associated personal practice data through our deletion workflow. Recruiting records controlled by an organization, billing records, provider backups, and security or operational logs may have separate retention requirements. Contact support with questions about a specific record or a deletion request; deleting your account does not itself cancel a paid subscription."],
    ["Your choices and requests", "You can update account information, remove resumes, delete your account, and decline optional device permissions. Contact support to request access, correction, or deletion of personal information, to raise a privacy concern, or to ask about rights available under applicable law. We may need to verify your identity before acting on a request. Withdrawing permission for information required by a feature may prevent us from providing that feature."],
    ["Cookies and security", "We use authentication cookies and browser storage to support sign-in and service functionality. We use access controls, encrypted transport, session protections, rate limits, audit logging, and file validation to protect information. No online service can guarantee absolute security. Keep your account credentials secure and report suspected unauthorized access to support."],
    ["Updates to this policy", "We may update this policy as our services or data practices change. The effective date identifies the latest version. Material changes will be communicated through appropriate service notices. Contact support if you need clarification about a change."],
];

const termsSections = [
    ["Agreement and operator", "These terms govern your use of EvalcueAI, operated by SAURABH MAURYA. By creating an account, purchasing a service, or using the platform, you agree to these terms. If you use EvalcueAI for an organization, you must have authority to act on its behalf. Any separately agreed written service agreement applies to the extent it expressly overrides these terms."],
    ["Our services", "EvalcueAI provides AI-assisted interview practice, resume tools, and structured technical hiring assessments. Plan descriptions identify included features, usage limits, and access periods. Practice feedback is educational; the service does not guarantee an interview, job offer, assessment score, or employment outcome."],
    ["Accounts and access", "Provide accurate account information, protect your credentials, and use only accounts and organization resources you are authorized to access. You are responsible for activity under your account and should promptly report suspected unauthorized use. Organization owners and administrators are responsible for managing team access and assessment permissions."],
    ["Prices, payments, and subscriptions", "The selected plan and checkout show the price, currency, billing period, and applicable taxes before payment. Recurring subscriptions renew according to the terms shown at checkout until canceled through billing management. The Launch Pilot is a one-time purchase with the candidate capacity and validity period shown in its offer. Usage limits and access periods apply; account deletion alone does not cancel a subscription."],
    ["Cancellation and billing questions", "Use billing management to review invoices, update payment methods, and cancel recurring subscriptions. Review the confirmation for the date cancellation takes effect. For a disputed charge or refund request, contact support with the relevant invoice and a description of the issue. Any expressly agreed refund terms and rights required by applicable law remain applicable."],
    ["Acceptable use", "Do not access another person’s information without authorization, impersonate someone, evade plan or security limits, disrupt the service, upload malicious files, or use code execution to attack systems. Submit only content you are entitled to use. Candidates must follow the assessment owner’s instructions and must not misrepresent their identity or the authorship of submitted work."],
    ["Your content and our platform", "You retain ownership of content you submit. You grant us permission to store, process, transmit to service providers, and display that content as needed to deliver the features you request, including sharing assessment submissions and reports with the recruiting organization. EvalcueAI branding, software, and platform materials remain the property of their respective owners; access to the service does not transfer ownership."],
    ["AI output and hiring decisions", "AI-generated questions, feedback, scores, and resume suggestions may be inaccurate, incomplete, or biased. Review outputs before relying on them and verify factual claims before using generated resumes. Recruiting teams must independently review evidence and must not use an AI score or report as the sole basis for a hiring decision. Assessment owners remain responsible for lawful recruitment practices and appropriate candidate notices."],
    ["Privacy and candidate information", "Our Privacy Policy describes how we process personal information. Recruiting organizations are responsible for their use of candidate data, their access permissions, and any required notices or permissions for assessments. Do not upload third-party personal information unless you have the necessary authority."],
    ["Availability and suspension", "We may perform maintenance, update features, or restrict access to address misuse, security incidents, or legal requirements. We do not promise uninterrupted or error-free service. Where reasonably practicable, we will communicate material changes affecting paid access. You may stop using the service and delete your account, subject to separately managing any active subscription."],
    ["Responsibility and applicable rights", "Use the service with appropriate independent judgment. We do not warrant that AI outputs will be suitable for every purpose. Nothing in these terms excludes obligations, remedies, or consumer rights that cannot lawfully be excluded under applicable law. Contact support about service issues or disputes so we can investigate and seek a resolution."],
    ["Changes to these terms", "The effective date identifies the current version. We may revise these terms as the service changes and will communicate material updates through appropriate service notices. Review updated terms before continuing to use the affected services."],
];

export default function LegalPage({ type }) {
    const privacy = type === "privacy";
    const sections = privacy ? privacySections : termsSections;
    return (
        <PublicSiteFrame>
            <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
                <Paper variant="outlined" sx={{ py: { xs: 2, md: 3 }, border: 0 }}>
                    <Typography variant="overline" color="primary.main" fontWeight={800}>EvalcueAI</Typography>
                    <Typography component="h1" variant="h3" fontWeight={800} mt={1}>{privacy ? "Privacy notice" : "Terms of use"}</Typography>
                    <Typography color="text.secondary" mt={1}>Effective October 1, 2026</Typography>
                    <Typography color="text.secondary" mt={2} lineHeight={1.75}>
                        {privacy ? "How we collect, use, share, and protect your information, and the choices available to you." : "The terms for using our practice tools, hiring assessments, and paid services."}
                    </Typography>
                    <Box component="nav" aria-label="On this page" sx={{ mt: 4, p: 2.5, bgcolor: "action.hover", borderRadius: 2 }}>
                        <Typography fontWeight={750} mb={1}>On this page</Typography>
                        <Stack spacing={.75}>
                            {sections.map(([title], index) => <Link key={title} href={`#section-${index + 1}`} underline="hover">{index + 1}. {title}</Link>)}
                            <Link href="#legal-contact" underline="hover">Contact and business details</Link>
                        </Stack>
                    </Box>
                    <Stack spacing={4} mt={5}>
                        {sections.map(([title, body], index) => <Box component="section" id={`section-${index + 1}`} key={title} sx={{ scrollMarginTop: 96 }}><Typography component="h2" variant="h6" fontWeight={750}>{title}</Typography><Typography color="text.secondary" mt={1} lineHeight={1.75}>{body}</Typography></Box>)}
                        <Box component="section" id="legal-contact" sx={{ scrollMarginTop: 96 }}>
                            <Typography component="h2" variant="h6" fontWeight={750}>Contact and business details</Typography>
                            <Typography color="text.secondary" mt={1}>EvalcueAI is operated by {BUSINESS_LEGAL_NAME}.</Typography>
                            <Typography color="text.secondary" mt={1}>
                                {publicSupportEmail ? <>Contact <Link href={`mailto:${publicSupportEmail}`}>{publicSupportEmail}</Link>.</> : "Contact the support channel provided by your EvalcueAI deployment administrator."}
                            </Typography>
                        </Box>
                    </Stack>
                </Paper>
            </Container>
            <SiteFooter />
        </PublicSiteFrame>
    );
}

# Security policy

Report vulnerabilities through GitHub private vulnerability reporting. Do not include secrets or personal data in public issues.

Supported production releases receive fixes for critical and high-severity vulnerabilities. Automated dependency checks run on every change and weekly through Dependabot.

EvalcueAI processes resumes, interview answers, and job descriptions and may send that content to configured AI providers. Production operators must document the selected providers, retention behavior, subprocessors, deletion policy, and user data export process in the published privacy notice.

Known exception: the current React Router advisory concerns React Server Components action handling. This application is a client-only BrowserRouter SPA and does not enable React Router framework/RSC actions. The exception should be removed as soon as an upstream patched release is available.

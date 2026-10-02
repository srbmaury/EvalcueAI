import { debuggingCopy, debuggingItems } from "./featureFlags.js";

export const SEARCH_LANDING_PAGES = [
    {
        slug: "ai-interview-practice",
        path: "/ai-interview-practice",
        audience: "Software engineers at any level preparing for technical interviews, from new graduates to senior and staff candidates.",
        title: "AI Interview Practice for Software Engineers",
        metaTitle: "AI Interview Practice for Software Engineers | EvalcueAI",
        description: "Practice realistic software engineering interviews with an adaptive AI interviewer across technical discussion, coding, system design, debugging, and behavioral follow-ups.",
        eyebrow: "AI interview practice",
        intro: "Rehearse the parts of a software engineering interview that are difficult to practice alone: explaining decisions out loud, handling follow-up questions, defending trade-offs, and reviewing where your answers became shallow or unclear.",
        sections: [
            {
                heading: "Practice a conversation, not a static question list",
                body: "EvalcueAI uses the role, job description, and your previous answers as context for follow-up questions. That makes practice closer to an interview conversation where the next question depends on the evidence you have already given.",
                points: ["Role- and job-description-specific prompts", "Adaptive follow-ups based on your answers", "Voice or text technical discussion", "Post-interview feedback and improvement suggestions"],
            },
            {
                heading: "Cover the full software engineering interview loop",
                body: "Technical interviews test different signals. Use separate practice rounds for coding, system design, debugging, backend depth, and behavioral ownership instead of treating every interview as a generic Q&A session.",
                points: ["Coding and problem-solving rounds", "Live system-design discussion with an architecture canvas", "Production-style debugging and engineering judgment", "Behavioral and project-depth follow-ups"],
            },
            {
                heading: "Use evidence from each session to improve the next one",
                body: "The useful output of mock practice is not a single score. Review where requirements were missed, assumptions were unstated, complexity analysis was weak, or technical choices were not justified, then repeat the weak area deliberately.",
                points: ["Transcript and answer review", "Competency-oriented feedback", "Recurring weakness identification", "Progress tracking across practice sessions"],
            },
        ],
        faq: [
            ["What is AI interview practice?", "AI interview practice uses an AI interviewer to simulate interview questions, listen to or read your answers, ask follow-ups, and provide feedback so you can rehearse before a real interview."],
            ["Can I practice technical interviews with AI?", "Yes. EvalcueAI supports software engineering practice across technical discussion, coding, system design, backend topics, debugging, and behavioral questions."],
            ["Is AI interview feedback always correct?", "No. Treat AI feedback as coaching evidence rather than an unquestionable answer key. Validate technical claims and use repeated patterns across sessions to guide deliberate practice."],
        ],
        related: ["ai-mock-interview", "software-engineer-interview-practice", "technical-interview-practice"],
        practiceResource: "software-engineer-mock-interview",
        schema: "WebPage",
    },
    {
        slug: "ai-mock-interview",
        path: "/ai-mock-interview",
        audience: "Software engineers who want to rehearse a full interview, with follow-up pressure, before the real one.",
        title: "AI Mock Interview for Software Engineers",
        metaTitle: "AI Mock Interview for Software Engineers | EvalcueAI",
        description: "Run an AI mock interview for software engineering roles with adaptive follow-ups, coding, system design, resume and job-description context, and structured feedback.",
        eyebrow: "AI mock interview",
        intro: "Use a realistic mock interview to practice how you think and communicate under follow-up pressure, not just whether you can recall an answer when reading a question by yourself.",
        sections: [
            {
                heading: "Start from the role you are actually interviewing for",
                body: "A backend SDE-2 interview should not look like a frontend graduate interview. Add the target role or job description so the mock interview can emphasize the technical areas and level of depth that matter for that position.",
                points: ["Role and seniority context", "Job-description-aware interview planning", "Resume context when you choose to provide it", "Different round types for different interview signals"],
            },
            {
                heading: "Handle adaptive interviewer follow-ups",
                body: "Strong interviews rarely stop after the first answer. Practice clarifying assumptions, explaining alternatives, responding to edge cases, and defending trade-offs when the interviewer challenges your initial approach.",
                points: ["Clarification questions", "Deeper technical probes", "Trade-off and failure-mode discussion", "Evidence-seeking project follow-ups"],
            },
            {
                heading: "Review the interview while it is still fresh",
                body: "After the session, use the transcript and feedback to identify the specific places where the answer lost structure or technical depth. Repeating one weak round with a clear improvement goal is more useful than collecting disconnected mock interviews.",
                points: ["Immediate feedback", "Answer-level improvement areas", "Technical depth review", "Repeatable practice workflow"],
            },
        ],
        faq: [
            ["How does an AI mock interview work?", "You choose a target role or interview focus, answer questions in a simulated interview, receive adaptive follow-ups, and then review feedback on the evidence and clarity in your responses."],
            ["Can I do a software engineer mock interview online?", "Yes. EvalcueAI is browser-based and supports software engineering mock practice across conversational, coding, and system-design rounds."],
            ["Should I use a mock interview before every real interview?", "Mock interviews are most useful when you have a specific target and enough time to review the feedback, practice the weak area, and repeat it before the real interview."],
        ],
        related: ["ai-interview-practice", "software-engineer-interview-practice", "system-design-interview-practice"],
        practiceResource: "software-engineer-mock-interview",
        schema: "WebPage",
    },
    {
        slug: "software-engineer-interview-practice",
        path: "/software-engineer-interview-practice",
        audience: "Backend, frontend, full-stack, and platform engineers preparing for a software engineering interview loop.",
        title: "Software Engineer Interview Practice",
        metaTitle: "Software Engineer Interview Practice with AI | EvalcueAI",
        description: "Practice software engineering interviews with AI across coding, APIs, databases, debugging, system design, reliability, projects, and behavioral ownership.",
        eyebrow: "Software engineer interview practice",
        intro: "Prepare for the complete software engineering interview loop by practicing implementation, design, production reasoning, project depth, and communication as separate signals.",
        sections: [
            {
                heading: "Practice the technical areas interviewers actually probe",
                body: "Software engineering interviews often move between implementation details and production reasoning. Prepare to explain algorithms, APIs, data models, concurrency, caching, reliability, testing, and the decisions behind systems you have built.",
                points: ["Coding and complexity analysis", "API and data-model design", "Databases, caching, queues, and concurrency", "Testing, observability, reliability, and incidents"],
            },
            {
                heading: "Prepare your project and experience stories",
                body: "Experienced-engineer interviews frequently use your own work as the starting point. Practice describing the problem, constraints, your contribution, alternatives considered, measurable outcome, and what you would change now.",
                points: ["Architecture deep dives", "Production incident discussion", "Ownership and collaboration", "Trade-offs and measurable outcomes"],
            },
            {
                heading: "Match practice depth to seniority",
                body: "As seniority increases, interviewers generally expect more explicit trade-off reasoning, ambiguity handling, failure analysis, and system-level judgment. Configure practice around the level you are targeting instead of using the same question depth for every role.",
                points: ["SDE-1 fundamentals", "SDE-2 design and production reasoning", "Senior architecture and ownership", "Role-specific technical depth"],
            },
        ],
        faq: [
            ["What should a software engineer practice before an interview?", "A balanced plan usually includes coding, role-specific technical depth, system or low-level design where relevant, project deep dives, debugging and production reasoning, and behavioral ownership stories."],
            ["Can EvalcueAI use a job description for practice?", "Yes. Job-description context can be used to shape the interview toward the technologies, responsibilities, and seniority described in the role."],
            ["Is this only for backend engineers?", "No. The practice workflow can be configured for backend, frontend, full-stack, platform, and other software engineering roles."],
        ],
        related: ["technical-interview-practice", "coding-interview-practice", "backend-engineer-interview-practice"],
        practiceResource: "software-engineer-mock-interview",
        schema: "TechArticle",
    },
    {
        slug: "technical-interview-practice",
        path: "/technical-interview-practice",
        audience: "Engineers who can solve problems but want to explain decisions, trade-offs, and failure modes more clearly under questioning.",
        title: "Technical Interview Practice with AI",
        metaTitle: "Technical Interview Practice with AI for Engineers | EvalcueAI",
        description: "Practice technical interviews with adaptive AI follow-ups across coding, system design, debugging, backend engineering, APIs, databases, reliability, and project depth.",
        eyebrow: "Technical interview practice",
        intro: "Technical interview preparation becomes more useful when you have to explain your reasoning, react to new constraints, and defend decisions instead of only reading model answers.",
        sections: [
            {
                heading: "Turn knowledge into interview-ready explanations",
                body: "Knowing a concept and explaining it under pressure are different skills. Practice stating assumptions, walking through an approach, analyzing complexity, testing edge cases, and communicating why a technical decision fits the constraints.",
                points: ["Reasoning before implementation", "Complexity and edge-case discussion", "Alternative approaches", "Clear technical communication"],
            },
            {
                heading: "Mix implementation with production engineering",
                body: "For experienced roles, technical interviews often extend beyond data structures. Prepare for API design, database behavior, caching, queues, distributed systems, observability, incident debugging, and system evolution.",
                points: ["Algorithms and coding", "APIs and databases", "Distributed systems and reliability", "Debugging and observability"],
            },
            {
                heading: "Use targeted rounds instead of random questions",
                body: "Choose the exact area you need to improve and run a focused mock round. This makes it easier to compare attempts and see whether your reasoning, structure, and technical depth are actually getting better.",
                points: ["Focused practice tracks", "Role-specific prompts", "Adaptive follow-ups", "Reviewable session history"],
            },
        ],
        faq: [
            ["What is the best way to practice a technical interview?", "Combine active problem solving with spoken or written explanation, interviewer-style follow-ups, and a review of your mistakes. Repeating weak areas deliberately is more effective than only reading more questions."],
            ["What technical interview topics can I practice?", "EvalcueAI supports coding, system design, backend engineering, Java-oriented depth, debugging, APIs, databases, reliability, and role-specific technical discussion."],
            ["Can technical interview practice include my resume?", "Yes. When you choose to provide resume context, practice can include project and experience follow-ups in addition to general technical questions."],
        ],
        related: ["software-engineer-interview-practice", "system-design-interview-practice", "coding-interview-practice"],
        practiceResource: "software-engineer-mock-interview",
        schema: "TechArticle",
    },
    {
        slug: "system-design-interview-practice",
        path: "/system-design-interview-practice",
        audience: "Mid-level, senior, and staff engineers preparing for system-design rounds.",
        example: {
            heading: "Example: a live system-design checkpoint",
            intro: "Illustrative exchange from a URL-shortener round. The interviewer follows your discussion and canvas and speaks up only when a real interviewer would.",
            turns: [
                [
                    "Candidate",
                    "I'll generate short codes with an auto-increment ID encoded in base62, stored in a single Postgres table."
                ],
                [
                    "Interviewer",
                    "Suppose traffic grows 10x from your current assumption. What part of this design changes first?"
                ],
                [
                    "Candidate",
                    "The single ID sequence and write path become the bottleneck, so I'd pre-allocate ID ranges per app server and shard the mapping table by code."
                ],
                [
                    "Interviewer",
                    "What happens to redirects if the shard holding a popular code is unavailable?"
                ]
            ],
            evaluates: [
                "Requirements and capacity assumptions",
                "Architecture and data flow",
                "Scalability as load grows",
                "Failure handling and availability",
                "Trade-off reasoning"
            ]
        },
        title: "System Design Interview Practice with AI",
        metaTitle: "System Design Interview Practice with AI | EvalcueAI",
        description: "Practice system design interviews with a live AI interviewer and architecture canvas. Rehearse requirements, APIs, data models, scaling, reliability, and trade-offs.",
        eyebrow: "System design interview practice",
        intro: "Practice the conversation around an architecture, not just the finished diagram. Clarify requirements, sketch the design, explain data flow, and respond when the interviewer pushes on scale, consistency, failures, or trade-offs.",
        sections: [
            {
                heading: "Use a repeatable system design interview structure",
                body: "A clear structure helps you avoid jumping directly into infrastructure. Start with requirements and scale, define APIs and data, propose the high-level architecture, then spend the remaining time on bottlenecks, failures, and explicit trade-offs.",
                points: ["Functional and non-functional requirements", "Capacity and traffic assumptions", "APIs and core data model", "Architecture, bottlenecks, reliability, and trade-offs"],
            },
            {
                heading: "Draw and explain the architecture together",
                body: "EvalcueAI system-design rounds include an architecture canvas so the diagram and discussion evolve together. The interviewer can probe the design while you explain components, dependencies, data movement, and failure handling.",
                points: ["Live architecture canvas", "Context-aware interviewer interjections", "Component and data-flow discussion", "Diagram-aware evaluation context"],
            },
            {
                heading: "Practice the questions that expose shallow designs",
                body: "The difficult part of a system design round is usually the follow-up: what fails first, how data is partitioned, what consistency is required, how retries stay safe, where observability lives, and what changes at ten times the load.",
                points: ["Hotspots and partitioning", "Caching and invalidation", "Retries, idempotency, and queues", "Multi-region, disaster recovery, and observability"],
            },
        ],
        faq: [
            ["How do I practice system design interviews?", "Use a timed problem, clarify requirements first, state scale assumptions, define APIs and data, draw a coherent architecture, and spend meaningful time defending trade-offs and failure handling."],
            ["Can I draw diagrams during EvalcueAI system design practice?", "Yes. System-design rounds use a live architecture canvas alongside the interviewer discussion."],
            ["What system design problems should I practice?", "Common starting points include URL shorteners, notification systems, file storage, chat systems, rate limiting, job processing, feeds, and other services that expose different scaling and consistency trade-offs."],
        ],
        related: ["technical-interview-practice", "backend-engineer-interview-practice", "ai-mock-interview"],
        practiceResource: "system-design-interview-preparation",
        schema: "TechArticle",
    },
    {
        slug: "coding-interview-practice",
        path: "/coding-interview-practice",
        audience: "Engineers preparing for data-structures, algorithms, and practical coding rounds in JavaScript, Python, Java, or C++.",
        example: {
            heading: "Example: past a passing solution",
            intro: "Illustrative follow-ups after a working answer to \"return the k most frequent elements\". The code runs, and then the interviewer tests understanding.",
            turns: [
                [
                    "Candidate",
                    "I count frequencies in a hash map, then sort the entries by count and take the first k."
                ],
                [
                    "Interviewer",
                    "What's the time complexity, and can you avoid the full sort?"
                ],
                [
                    "Candidate",
                    "Sorting is O(n log n). A min-heap of size k gives O(n log k), and bucket sort by frequency gives O(n)."
                ],
                [
                    "Interviewer",
                    "Which would you choose if the input were a stream you couldn't hold in memory?"
                ]
            ],
            evaluates: [
                "Correctness, verified by running the code",
                "Time and space complexity",
                "Choosing alternative approaches",
                "Code quality",
                "Reasoning about constraints"
            ]
        },
        title: "Coding Interview Practice with AI",
        metaTitle: "Coding Interview Practice with AI for Software Engineers | EvalcueAI",
        description: "Practice coding interviews with AI follow-ups on reasoning, implementation, complexity, tests, edge cases, and optimization across common DSA topics.",
        eyebrow: "Coding interview practice",
        intro: "Practice coding as an interview skill: clarify the problem, explain the approach, implement it, test edge cases, analyze complexity, and respond to optimization follow-ups.",
        sections: [
            {
                heading: "Practice the reasoning interviewers hear before the code",
                body: "A correct solution is stronger when the reasoning is clear. State the brute-force approach, identify the bottleneck, choose an appropriate data structure, explain invariants, and call out edge cases before implementation.",
                points: ["Problem clarification", "Approach and data-structure choice", "Correctness reasoning", "Time and space complexity"],
            },
            {
                heading: "Cover the common coding patterns",
                body: "Use focused rounds for arrays and hashing, two pointers, sliding windows, stacks and queues, trees and graphs, heaps, binary search, backtracking, greedy problems, and dynamic programming.",
                points: ["Arrays, strings, and hashing", "Trees and graphs", "Heaps, intervals, and binary search", "Backtracking and dynamic programming"],
            },
            {
                heading: "Finish with tests and follow-up optimization",
                body: "After implementation, explicitly test boundary cases and discuss how the solution changes if inputs are larger, memory is constrained, data arrives as a stream, or concurrency is introduced.",
                points: ["Edge-case tests", "Complexity verification", "Alternative implementations", "Constraint-change follow-ups"],
            },
        ],
        faq: [
            ["How should I practice coding interviews?", "Solve problems under interview-like constraints and explain your thinking as you go. Always finish with complexity analysis, tests, edge cases, and at least one possible follow-up or optimization."],
            ["Does EvalcueAI support coding rounds?", "Yes. Practice can include coding and online-assessment style rounds with interviewer context and post-session feedback."],
            ["Should I memorize coding solutions?", "Memorizing exact solutions is brittle. Learn reusable problem-solving patterns and practice deriving the approach from constraints so you can adapt when the interviewer changes the problem."],
        ],
        related: ["technical-interview-practice", "software-engineer-interview-practice", "backend-engineer-interview-practice"],
        practiceResource: "coding-interview-questions",
        schema: "TechArticle",
    },
    {
        slug: "backend-engineer-interview-practice",
        path: "/backend-engineer-interview-practice",
        audience: "Backend and platform engineers preparing for rounds on APIs, databases, caching, messaging, and reliability.",
        example: {
            heading: "Example: testing a resume claim",
            intro: "Illustrative resume probe. EvalcueAI asks about claims that are actually in your resume, looking for your own contribution and how the result was measured.",
            turns: [
                [
                    "Interviewer",
                    "You mentioned \"reduced checkout API p99 latency by 40%\". What was your specific technical contribution to that result?"
                ],
                [
                    "Candidate",
                    "I found an N+1 query in the pricing service and replaced it with a batched lookup plus a per-request cache."
                ],
                [
                    "Interviewer",
                    "How did you measure the result and establish that your change actually caused it?"
                ]
            ],
            evaluates: [
                "Ownership of the work",
                "Measurement and evidence",
                "Backend fundamentals",
                "Technical trade-offs",
                "Communication"
            ]
        },
        title: "Backend Engineer Interview Practice",
        metaTitle: "Backend Engineer Interview Practice with AI | EvalcueAI",
        description: "Practice backend engineering interviews across APIs, databases, transactions, caching, queues, concurrency, distributed systems, reliability, observability, and system design.",
        eyebrow: "Backend interview practice",
        intro: "Prepare for backend interviews that connect code to production systems. Practice API and data design, concurrency, caching, asynchronous workflows, failure handling, observability, and architecture trade-offs.",
        sections: [
            {
                heading: "Go beyond framework trivia",
                body: "Backend interviews are strongest when they test engineering decisions rather than memorized definitions. Practice explaining how requests flow through a service, how data is stored, what happens under concurrency, and how the system behaves when dependencies fail.",
                points: ["REST and API design", "SQL, NoSQL, indexes, and transactions", "Caching and invalidation", "Concurrency and asynchronous processing"],
            },
            {
                heading: "Prepare for distributed-systems follow-ups",
                body: "Be ready to discuss idempotency, retries, queues, partitioning, replication, consistency, rate limiting, backpressure, failover, and how you would observe the system in production.",
                points: ["Retries and idempotency", "Queues and delivery guarantees", "Partitioning and replication", "Metrics, logs, traces, and alerting"],
            },
            {
                heading: "Connect backend depth to system design",
                body: "Backend interviews often transition naturally into system design. Practice making storage and communication choices from access patterns and reliability requirements instead of naming technologies before the problem is clear.",
                points: ["Access-pattern-driven storage choices", "Synchronous vs asynchronous boundaries", "Scalability and failure modes", "Operational and cost trade-offs"],
            },
        ],
        faq: [
            ["What should I study for a backend engineer interview?", "Focus on your primary language, API design, databases and transactions, concurrency, caching, queues, distributed systems, reliability, observability, testing, and system design at the depth expected for your seniority."],
            ["Can I practice Java backend interviews?", "Yes. EvalcueAI already includes Java-oriented practice covering core Java, collections, concurrency, and backend engineering topics."],
            ["Are backend interviews only coding interviews?", "No. Many backend roles combine coding with API and database design, debugging, distributed-systems reasoning, production reliability, and system design."],
        ],
        related: ["system-design-interview-practice", "technical-interview-practice", debuggingCopy("debugging-interview-practice", "software-engineer-interview-practice")],
        practiceResource: "java-interview-questions",
        schema: "TechArticle",
    },
    ...debuggingItems({
        slug: "debugging-interview-practice",
        path: "/debugging-interview-practice",
        audience: "Engineers facing debugging or \"fix this codebase\" rounds, and anyone who wants to practice production-style diagnosis.",
        example: {
            heading: "Example: a debugging round",
            intro: "Illustrative flow on a multi-file service where orders are occasionally charged twice. In fix mode, your change is graded against hidden tests you cannot see.",
            turns: [
                [
                    "Candidate",
                    "The retry wrapper in payments/client.js retries on timeout, but the charge request carries no idempotency key, so a slow success gets charged again."
                ],
                [
                    "Interviewer",
                    "How did you confirm that before changing code?"
                ],
                [
                    "Candidate",
                    "I reproduced it with a delayed mock response, and the log showed two charge calls sharing one order ID. Then I passed the order ID as the idempotency key."
                ],
                [
                    "Interviewer",
                    "What else in this codebase would break if the payment provider ignored that key?"
                ]
            ],
            evaluates: [
                "Reproducing before changing code",
                "Root cause, not just the symptom",
                "A fix that passes the hidden tests",
                "Side effects and regression risk",
                "Explaining the diagnosis"
            ]
        },
        title: "Debugging Interview Practice for Software Engineers",
        metaTitle: "Debugging Interview Practice for Software Engineers | EvalcueAI",
        description: "Practice software engineering debugging interviews with production-style scenarios, hypothesis-driven investigation, code evidence, tests, and root-cause reasoning.",
        eyebrow: "Debugging interview practice",
        intro: "Debugging interviews test how you investigate uncertainty. Practice forming hypotheses, collecting evidence, narrowing the failure, validating the root cause, and explaining a safe fix instead of guessing from symptoms.",
        sections: [
            {
                heading: "Use a hypothesis-driven debugging process",
                body: "Start by defining the symptom and blast radius. Gather the highest-signal evidence, form a small set of hypotheses, test them in an order that reduces uncertainty quickly, and update the investigation when evidence contradicts the initial theory.",
                points: ["Clarify the symptom and scope", "Collect logs, metrics, traces, and code evidence", "Rank and test hypotheses", "Confirm root cause before proposing the fix"],
            },
            {
                heading: "Practice production-style failure scenarios",
                body: "Useful debugging practice includes intermittent 500s, latency regressions, database slowdowns, race conditions, cache inconsistency, queue backlogs, memory growth, and failures introduced by recent deployments.",
                points: ["Performance regressions", "Data and concurrency bugs", "Dependency and network failures", "Deployment and configuration regressions"],
            },
            {
                heading: "Show how you would prove the fix",
                body: "A debugging answer is incomplete without validation. Explain the test that reproduces the bug, the smallest safe change, regression coverage, rollout strategy, and the monitoring that confirms the production symptom is gone.",
                points: ["Reproduction and regression test", "Root-cause-focused fix", "Safe rollout or rollback plan", "Post-fix monitoring"],
            },
        ],
        faq: [
            ["What is a debugging interview?", "A debugging interview evaluates how you investigate an unfamiliar failure, use evidence, reason about root causes, and validate a fix. It may use a scenario, logs, or an existing codebase rather than a blank coding problem."],
            ["How can I get better at debugging interviews?", "Practice narrating a structured investigation. Avoid jumping immediately to a fix; explain what evidence you would inspect, what each observation would imply, and how you would falsify your hypotheses."],
            ["Does EvalcueAI support debugging assessments?", "EvalcueAI Hire supports production-style multi-file debugging assessments, while candidate practice can be configured around debugging and production-reasoning scenarios."],
        ],
        related: ["backend-engineer-interview-practice", "technical-interview-practice", "software-engineer-interview-practice"],
        practiceResource: "software-engineer-mock-interview",
        schema: "TechArticle",
    }),
    {
        slug: "system-design",
        path: "/system-design",
        title: "System Design Interview Questions & Practice",
        metaTitle: "System Design Interview Questions & Practice | EvalcueAI",
        description: "Practice common system design interview problems with requirements, APIs, data models, architecture, scalability, reliability, and trade-off follow-ups.",
        eyebrow: "System design interview hub",
        intro: "Use this collection to practice system design as an interview conversation. Start from an open-ended problem, clarify requirements, define APIs and data, draw the architecture, then defend the design under scaling and failure follow-ups.",
        sections: [
            {
                heading: "Use one repeatable interview framework",
                body: "A consistent structure prevents you from jumping directly to technologies. Clarify functional and non-functional requirements, estimate scale, define APIs and data, draw the high-level design, then spend the rest of the interview on bottlenecks, failure modes, and trade-offs.",
                points: ["Requirements and scope", "Capacity and traffic assumptions", "APIs and data model", "Architecture, failures, and trade-offs"],
            },
            {
                heading: "Practice problems that expose different design skills",
                body: "Different prompts reveal different strengths. URL shortening emphasizes read-heavy access and ID generation; rate limiting emphasizes distributed coordination; file storage emphasizes metadata and synchronization; notifications emphasize fan-out and retries; payments emphasize correctness and idempotency.",
                points: ["URL shortener", "Distributed rate limiter", "Google Drive-like storage", "Notification and payment systems"],
            },
            {
                heading: "Answer follow-ups, not just the first prompt",
                body: "The real signal in a system design interview often appears after the initial diagram. Practice responding when the interviewer changes traffic, consistency, latency, regional, security, or reliability requirements.",
                points: ["Hot keys and hotspots", "Consistency and replication", "Retries and idempotency", "Multi-region and disaster recovery"],
            },
        ],
        faq: [
            ["What are common system design interview questions?", "Common prompts include URL shorteners, rate limiters, notification systems, file storage, chat systems, feeds, payment systems, job schedulers, and other services that expose scalability and reliability trade-offs."],
            ["How should I structure a system design interview?", "A practical flow is requirements, rough scale estimates, APIs, data model, high-level architecture, key bottlenecks, scaling, reliability, security and observability, followed by explicit trade-offs."],
            ["How long should I spend on the initial architecture?", "Avoid spending the entire interview drawing the first diagram. Build a coherent baseline quickly so there is time for the deeper follow-up discussion where many interview signals appear."],
        ],
        related: ["system-design-interview-practice", "url-shortener-system-design", "rate-limiter-system-design", "google-drive-system-design", "notification-service-system-design"],
        practiceResource: "system-design-interview-preparation",
        schema: "CollectionPage",
    },
    {
        slug: "url-shortener-system-design",
        path: "/system-design/url-shortener",
        title: "Design a URL Shortener",
        metaTitle: "Design a URL Shortener: System Design Interview | EvalcueAI",
        description: "Practice the URL shortener system design interview: requirements, short-code generation, APIs, storage, caching, redirects, hotspots, analytics, and trade-offs.",
        eyebrow: "System design problem",
        intro: "Design a Bitly- or TinyURL-like service that maps long URLs to compact aliases and serves extremely fast redirects. Use the problem to practice read-heavy architecture, unique ID generation, caching, hotspots, and failure handling.",
        sections: [
            {
                heading: "Clarify the requirements before choosing an encoding",
                body: "Start with the core write and redirect flows, then clarify custom aliases, expiry, analytics, authentication, abuse prevention, expected read-to-write ratio, latency, and availability. These decisions change the storage and short-code strategy.",
                points: ["Create a short URL", "Redirect short code to original URL", "Optional custom aliases and expiry", "High availability and low redirect latency"],
            },
            {
                heading: "Design the API, key generation, and read path",
                body: "A typical design separates URL creation from the latency-sensitive redirect path. Compare approaches such as base-62 encoding of generated IDs, random codes with collision checks, or hashes, and explain how uniqueness works under concurrency.",
                points: ["POST /urls and GET /{code}", "Base62 or random short-code generation", "Key-value access pattern", "Cache hot mappings before the primary store"],
            },
            {
                heading: "Deep dive into scale and failure modes",
                body: "The strongest follow-ups cover viral links, cache misses, database partitioning, redirect semantics, analytics that must not slow the redirect, code-generation failure, abuse, and multi-region availability.",
                points: ["Hot-key handling and cache strategy", "Partitioning and replication", "Asynchronous click analytics", "Rate limiting, abuse prevention, and observability"],
            },
        ],
        faq: [
            ["Why is URL shortener a common system design question?", "It has a small functional surface but opens useful discussions about capacity estimation, distributed ID generation, read-heavy storage, caching, database partitioning, availability, and trade-offs."],
            ["Should a URL shortener use SQL or NoSQL?", "Either can work. The important part is the access pattern and scale. The core lookup is usually a simple short-code-to-URL mapping, so explain consistency, indexing, partitioning, operational needs, and why your chosen store fits."],
            ["How do I handle a viral short URL?", "Keep the redirect path cache-friendly, replicate or distribute the cache, avoid synchronous analytics work, and explain how the storage layer and load balancers handle a single extremely hot key."],
        ],
        related: ["system-design", "rate-limiter-system-design", "notification-service-system-design", "system-design-interview-practice"],
        practiceResource: "system-design-interview-questions",
        schema: "TechArticle",
    },
    {
        slug: "rate-limiter-system-design",
        path: "/system-design/rate-limiter",
        title: "Design a Distributed Rate Limiter",
        metaTitle: "Design a Distributed Rate Limiter: System Design Interview | EvalcueAI",
        description: "Practice distributed rate limiter system design across algorithms, APIs, Redis-style shared state, atomicity, sharding, failure modes, and multi-region trade-offs.",
        eyebrow: "System design problem",
        intro: "Design a rate-limiting service that protects APIs across many application servers. The interview tests algorithm choice, distributed state, atomic updates, failure behavior, fairness, and the balance between strictness and availability.",
        sections: [
            {
                heading: "Define what is being limited",
                body: "Clarify whether limits apply per user, API key, IP, organization, endpoint, or a combination. Ask about burst allowance, request cost, response headers, regional scope, latency budget, and what should happen if the limiter is unavailable.",
                points: ["Identity and policy dimensions", "Requests per second or weighted cost", "Burst behavior", "Fail-open versus fail-closed"],
            },
            {
                heading: "Choose the algorithm from the requirements",
                body: "Compare fixed window, sliding window log, sliding window counter, token bucket, and leaky bucket. Explain memory, precision, burst behavior, and how atomicity is maintained when many servers update the same limiter state.",
                points: ["Token bucket for controlled bursts", "Sliding counters for smoother limits", "Atomic shared-state updates", "Local fast path versus centralized state"],
            },
            {
                heading: "Handle distributed and multi-region behavior",
                body: "At scale, discuss sharding by limiter key, Redis or another low-latency state store, local caches, clock assumptions, replication lag, cross-region limits, degraded behavior, configuration distribution, and observability.",
                points: ["Key-based sharding", "Replication and regional limits", "Policy configuration rollout", "Metrics for blocked requests and limiter latency"],
            },
        ],
        faq: [
            ["Which rate limiting algorithm is best for interviews?", "There is no universal best algorithm. Token bucket is a common choice when bursts should be allowed, while sliding-window approaches can enforce smoother limits. State the required behavior and choose accordingly."],
            ["Why is atomicity important in a distributed rate limiter?", "Multiple application servers may check and update the same limit concurrently. Without atomic operations, concurrent requests can all observe stale state and exceed the intended quota."],
            ["Should a rate limiter fail open or fail closed?", "It depends on risk. Consumer APIs may prefer availability and fail open during limiter outages, while security-sensitive or expensive operations may choose stricter behavior. Explain the business trade-off."],
        ],
        related: ["system-design", "url-shortener-system-design", "payment-system-design", "backend-engineer-interview-practice"],
        practiceResource: "system-design-interview-preparation",
        schema: "TechArticle",
    },
    {
        slug: "google-drive-system-design",
        path: "/system-design/google-drive",
        title: "Design Google Drive or Cloud File Storage",
        metaTitle: "Design Google Drive: File Storage System Design Interview | EvalcueAI",
        description: "Practice a Google Drive-like system design covering uploads, metadata, chunking, object storage, versioning, sharing, synchronization, consistency, and reliability.",
        eyebrow: "System design problem",
        intro: "Design a cloud file storage and synchronization service. The problem combines large-object transfer, metadata, permissions, versioning, sync, offline changes, and reliability across devices and regions.",
        sections: [
            {
                heading: "Separate file bytes from file metadata",
                body: "Clarify file-size limits, folders, sharing, versions, offline support, and synchronization. A common design stores large file chunks in object storage while a metadata service owns names, versions, permissions, chunk manifests, and user-visible hierarchy.",
                points: ["Resumable uploads", "Chunked object storage", "Metadata and version records", "Folders, ownership, and sharing"],
            },
            {
                heading: "Design upload, download, and sync flows",
                body: "Discuss multipart or chunked upload sessions, checksums, deduplication if required, pre-signed transfer URLs, download authorization, change logs, client cursors, and how devices learn which files changed.",
                points: ["Upload session API", "Chunk checksum and retry", "Change feed or sync cursor", "Conflict detection and versioning"],
            },
            {
                heading: "Deep dive into consistency and reliability",
                body: "Follow-ups often cover concurrent edits, metadata transactions, lost devices, deleted files, permission changes, chunk durability, multi-region replication, large-file retries, quotas, and disaster recovery.",
                points: ["Metadata consistency", "Conflict resolution", "Durable replicated object storage", "Deletion, retention, and recovery"],
            },
        ],
        faq: [
            ["Why split metadata from object storage?", "Metadata needs transactions, indexes, permissions, and low-latency listing, while large immutable file chunks benefit from scalable object storage. Separating them lets each workload use a suitable storage model."],
            ["How can file uploads resume after failure?", "Upload files in independently addressable chunks, persist an upload-session manifest, verify chunk checksums, and let the client retry only missing or failed chunks before finalizing the version."],
            ["How do multiple devices synchronize changes?", "Maintain an ordered or cursor-based change feed per user or workspace so clients can ask for changes since their last sync point, then resolve conflicts according to the product's consistency rules."],
        ],
        related: ["system-design", "notification-service-system-design", "url-shortener-system-design", "system-design-interview-practice"],
        practiceResource: "system-design-interview-questions",
        schema: "TechArticle",
    },
    {
        slug: "notification-service-system-design",
        path: "/system-design/notification-service",
        title: "Design a Notification Service",
        metaTitle: "Design a Notification Service: System Design Interview | EvalcueAI",
        description: "Practice notification service system design across APIs, fan-out, queues, user preferences, retries, rate limits, providers, idempotency, tracking, and delivery guarantees.",
        eyebrow: "System design problem",
        intro: "Design a platform that sends push, email, and SMS notifications at scale. This problem tests asynchronous processing, fan-out, provider abstraction, user preferences, retries, rate limits, idempotency, and observability.",
        sections: [
            {
                heading: "Clarify channels, urgency, and delivery semantics",
                body: "Ask which channels are supported, whether messages are transactional or bulk, required ordering, delay tolerance, user preferences, quiet hours, templates, localization, deduplication, and whether delivery is at-most-once or at-least-once.",
                points: ["Push, email, and SMS", "Transactional versus bulk traffic", "Preferences and quiet hours", "Priority and delivery expectations"],
            },
            {
                heading: "Use asynchronous fan-out and provider adapters",
                body: "A notification API should validate and persist intent quickly, then queues and workers can expand recipients, render templates, apply preferences and rate limits, and call channel-specific providers without blocking the producer.",
                points: ["Notification API", "Queue or event bus", "Channel-specific workers", "Provider abstraction and fallback"],
            },
            {
                heading: "Design retries without duplicate user impact",
                body: "Discuss idempotency keys, retry schedules, dead-letter queues, provider throttling, per-user limits, delivery status, webhook processing, partial provider outages, and observability across the end-to-end pipeline.",
                points: ["Idempotent delivery attempts", "Exponential backoff and DLQ", "Provider rate limits", "Delivery tracking and alerting"],
            },
        ],
        faq: [
            ["Why use queues in a notification service?", "Queues decouple producers from slower external providers, absorb bursts, enable retries, and let different channels scale independently without making the caller wait for final delivery."],
            ["How do you avoid duplicate notifications?", "Use stable notification or idempotency identifiers, make state transitions atomic, and ensure retried worker operations can recognize an already completed delivery attempt."],
            ["How should provider failures be handled?", "Retry transient failures with backoff, respect provider rate limits, use dead-letter handling for repeated failures, and consider a secondary provider only when product requirements justify the complexity."],
        ],
        related: ["system-design", "payment-system-design", "google-drive-system-design", "system-design-interview-practice"],
        practiceResource: "system-design-interview-questions",
        schema: "TechArticle",
    },
    {
        slug: "payment-system-design",
        path: "/system-design/payment-system",
        title: "Design a Payment System",
        metaTitle: "Design a Payment System: System Design Interview | EvalcueAI",
        description: "Practice payment system design across payment intents, idempotency, ledgers, provider integration, webhooks, retries, reconciliation, consistency, and failure handling.",
        eyebrow: "System design problem",
        intro: "Design a payment platform where correctness matters more than simply maximizing throughput. The interview focuses on idempotency, durable state transitions, money movement records, provider uncertainty, reconciliation, and safe retries.",
        sections: [
            {
                heading: "Model the payment lifecycle explicitly",
                body: "Clarify authorization, capture, refunds, payment methods, currencies, asynchronous provider results, and whether the system moves money itself or orchestrates payment processors. Represent payment state transitions explicitly instead of treating payment as one synchronous API call.",
                points: ["Payment intent and attempt", "Authorize, capture, refund", "Explicit state machine", "Stable idempotency key"],
            },
            {
                heading: "Keep a durable source of financial truth",
                body: "Discuss immutable transaction records or a double-entry-style ledger where appropriate, atomic database updates, unique constraints, outbox patterns, and why cache should never become the authoritative record of money movement.",
                points: ["Durable transaction records", "Atomic state transitions", "Ledger or accounting entries", "Transactional outbox for side effects"],
            },
            {
                heading: "Design for ambiguous provider outcomes",
                body: "Network timeouts can leave the caller unsure whether a provider completed a charge. Explain idempotent provider requests, webhook processing, polling when necessary, reconciliation jobs, duplicate-event handling, and operational tooling for exceptions.",
                points: ["Idempotent retries", "Signed provider webhooks", "Reconciliation", "Audit trails and observability"],
            },
        ],
        faq: [
            ["Why is idempotency critical in payment systems?", "Clients and services retry after timeouts. Without idempotency, the same logical payment can be processed more than once. A stable key lets repeated requests return or continue the same operation safely."],
            ["Should Redis store payment state?", "Redis can help with caching or coordination, but durable payment and ledger state should live in a transactional persistent store designed to preserve correctness across crashes and retries."],
            ["What is reconciliation?", "Reconciliation compares your internal payment records with processor or bank records to find missing, duplicated, delayed, or inconsistent transactions and resolve discrepancies."],
        ],
        related: ["system-design", "rate-limiter-system-design", "notification-service-system-design", "backend-engineer-interview-practice"],
        practiceResource: "system-design-interview-preparation",
        schema: "TechArticle",
    },
    {
        slug: "interview-questions",
        path: "/interview-questions",
        title: "Software Engineering Interview Questions",
        metaTitle: "Software Engineering Interview Questions by Topic | EvalcueAI",
        description: "Prepare for software engineering interviews with focused questions on Java, Spring Boot, Redis, distributed systems, microservices, coding, and system design.",
        eyebrow: "Technical interview question hub",
        intro: "Use topic-specific question sets to identify gaps, then practice the same area in an adaptive interview where follow-ups test whether you can apply the concept rather than only repeat a definition.",
        sections: [
            {
                heading: "Start with your primary backend stack",
                body: "For backend roles, depth in the language and framework matters. Practice Java fundamentals and concurrency, Spring Boot service behavior, Redis caching patterns, database and API reasoning, and the failure modes you have seen in production.",
                points: ["Java and JVM", "Spring Boot", "Redis and caching", "APIs and databases"],
            },
            {
                heading: "Add distributed-systems reasoning",
                body: "Experienced-engineer interviews increasingly ask what happens across service boundaries. Be prepared for consistency, replication, queues, idempotency, retries, partitioning, backpressure, observability, and partial failure.",
                points: ["Distributed systems", "Microservices", "Queues and asynchronous processing", "Reliability and observability"],
            },
            {
                heading: "Turn each answer into a follow-up conversation",
                body: "Definitions are only the beginning. For every topic, practice a scenario, a trade-off, a failure mode, and a question about when you would choose a different approach.",
                points: ["Definition", "Production scenario", "Trade-off", "Failure and debugging follow-up"],
            },
        ],
        faq: [
            ["How should I use interview question lists?", "Use them diagnostically. Answer aloud or in writing, mark weak topics, then practice those areas in scenarios or mock interviews instead of memorizing a long list of canned answers."],
            ["Which backend interview topics matter most?", "Your primary language, framework, APIs, databases, caching, concurrency, distributed systems, reliability, testing, observability, and system design are common areas for experienced backend roles."],
            ["How deep should interview answers be?", "Match the role level. Junior answers may focus on correct concepts; experienced roles usually require production examples, trade-offs, failure behavior, and reasons for choosing one approach over another."],
        ],
        related: ["java-interview-questions-guide", "spring-boot-interview-questions", "redis-interview-questions", "distributed-systems-interview-questions", "microservices-interview-questions"],
        practiceResource: "software-engineer-mock-interview",
        schema: "CollectionPage",
    },
    {
        slug: "java-interview-questions-guide",
        path: "/interview-questions/java",
        title: "Java Interview Questions for Software Engineers",
        metaTitle: "Java Interview Questions for Backend Engineers | EvalcueAI",
        description: "Prepare for Java interviews across JVM, collections, equality, generics, exceptions, concurrency, executors, CompletableFuture, memory, and backend scenarios.",
        eyebrow: "Java interview questions",
        intro: "Prepare for Java interviews by connecting language fundamentals to production behavior. Strong answers explain not only what an API does, but also memory, concurrency, correctness, and trade-offs.",
        sections: [
            {
                heading: "Core Java questions",
                body: "Be ready to explain Java semantics precisely and connect them to examples from real code.",
                points: ["Why is Java pass-by-value, including object references?", "equals() vs == and the hashCode contract", "Interface vs abstract class", "Checked vs unchecked exceptions and when to use each"],
            },
            {
                heading: "Collections and concurrency questions",
                body: "Backend interviews frequently probe data structure behavior and thread safety rather than surface-level syntax.",
                points: ["How does HashMap work and what causes collisions?", "ConcurrentHashMap vs synchronizedMap", "synchronized vs Lock", "ExecutorService, Future, and CompletableFuture trade-offs"],
            },
            {
                heading: "JVM and production follow-ups",
                body: "For experienced roles, prepare to discuss heap versus stack, garbage collection, memory leaks, thread pools, blocking calls, immutability, and how you would diagnose a Java service under load.",
                points: ["JDK vs JRE vs JVM", "Heap, stack, and object lifetime", "GC pauses and allocation pressure", "Diagnosing high CPU, memory, or thread contention"],
            },
        ],
        faq: [
            ["What Java topics are most common in backend interviews?", "Collections, equality and hashing, exceptions, generics, concurrency, thread pools, CompletableFuture, JVM memory, garbage collection, immutability, and practical Spring/backend scenarios are common."],
            ["Should I memorize HashMap internals?", "Understand the behavior and why it matters: hashing, bucket selection, collisions, equality, resizing, complexity, and thread-safety limitations. Memorizing implementation trivia without reasoning is less useful."],
            ["How do I practice Java interview follow-ups?", "After answering a concept question, add a scenario: concurrency, performance, failure, testing, or API design. EvalcueAI's Java practice track can use adaptive follow-ups instead of a fixed question list."],
        ],
        related: ["interview-questions", "spring-boot-interview-questions", "distributed-systems-interview-questions", "backend-engineer-interview-practice"],
        practiceResource: "java-interview-questions",
        schema: "TechArticle",
    },
    {
        slug: "spring-boot-interview-questions",
        path: "/interview-questions/spring-boot",
        title: "Spring Boot Interview Questions for Backend Engineers",
        metaTitle: "Spring Boot Interview Questions for Backend Engineers | EvalcueAI",
        description: "Prepare for Spring Boot interviews across dependency injection, auto-configuration, REST APIs, transactions, JPA, validation, security, testing, Actuator, and resilience.",
        eyebrow: "Spring Boot interview questions",
        intro: "Spring Boot interviews often test whether you understand what the framework is doing around your application. Prepare to explain dependency injection, transactions, persistence, web request handling, testing, security, and production operations.",
        sections: [
            {
                heading: "Framework and dependency-injection questions",
                body: "Start with the container and configuration model, then connect it to how services are composed and tested.",
                points: ["How does Spring Boot auto-configuration work?", "@Component, @Service, @Repository, and @Bean", "Constructor injection vs field injection", "What happens during application startup?"],
            },
            {
                heading: "Web, data, and transaction questions",
                body: "Backend interviews commonly move from controllers into persistence and transaction boundaries.",
                points: ["@RestController and request validation", "@Transactional behavior and common pitfalls", "JPA N+1 queries and fetch strategies", "Exception handling with @ControllerAdvice"],
            },
            {
                heading: "Production and testing follow-ups",
                body: "For experienced roles, prepare for Actuator, metrics, security filters, integration testing, connection pools, retries, circuit breakers, asynchronous work, and how you would investigate a slow Spring service.",
                points: ["Unit vs slice vs integration tests", "Actuator health and metrics", "Spring Security request flow", "Diagnosing latency and database bottlenecks"],
            },
        ],
        faq: [
            ["What Spring Boot areas should I study for interviews?", "Dependency injection, auto-configuration, REST controllers, validation, exception handling, transactions, JPA, testing, security, configuration, Actuator, and production troubleshooting are high-value areas."],
            ["Why can @Transactional fail unexpectedly?", "Common reasons include self-invocation bypassing the proxy, wrong propagation assumptions, exceptions that do not trigger rollback by default, or performing work outside the proxied transaction boundary."],
            ["Is Spring Boot knowledge enough for a backend interview?", "Usually not. Combine it with Java, SQL and databases, API design, caching, concurrency, distributed systems, testing, observability, and system design."],
        ],
        related: ["interview-questions", "java-interview-questions-guide", "redis-interview-questions", "microservices-interview-questions"],
        practiceResource: "java-interview-questions",
        schema: "TechArticle",
    },
    {
        slug: "redis-interview-questions",
        path: "/interview-questions/redis",
        title: "Redis Interview Questions for Backend Engineers",
        metaTitle: "Redis Interview Questions: Caching, Persistence & Scaling | EvalcueAI",
        description: "Prepare for Redis interviews across data structures, caching, TTLs, eviction, persistence, replication, clustering, pipelining, locks, cache stampede, and failure modes.",
        eyebrow: "Redis interview questions",
        intro: "Redis interview questions become much more useful when tied to production caching and coordination problems. Prepare to explain data structures, eviction, persistence, replication, clustering, and what can go wrong under load.",
        sections: [
            {
                heading: "Core Redis questions",
                body: "Understand why Redis is fast, its major data structures, expiration behavior, and the difference between using it as a cache and using it as a durable data store.",
                points: ["Why is Redis fast?", "Strings, hashes, lists, sets, sorted sets, and streams", "TTL and lazy/active expiration", "RDB vs AOF persistence"],
            },
            {
                heading: "Caching interview questions",
                body: "Caching questions usually probe invalidation and failure behavior rather than just GET and SET.",
                points: ["Cache-aside vs write-through", "Cache stampede and request coalescing", "Hot keys and TTL jitter", "Eviction policies and memory pressure"],
            },
            {
                heading: "Scaling and distributed follow-ups",
                body: "Prepare for replication, Sentinel, Cluster, pipelining, transactions or Lua for atomicity, distributed-lock caveats, and how the application behaves when Redis is slow or unavailable.",
                points: ["Replication and failover", "Redis Cluster and hash slots", "Pipelining vs transactions", "Graceful degradation during cache failure"],
            },
        ],
        faq: [
            ["What Redis questions are common in backend interviews?", "Data structures, TTLs, eviction, persistence, cache-aside, stampede prevention, hot keys, pipelining, replication, clustering, distributed locks, and failure handling are common."],
            ["Should Redis be the source of truth?", "It depends on the use case, but for many application caches Redis is intentionally not the durable source of truth. Explain persistence, recovery, consistency, and what happens if Redis data is lost."],
            ["How do you prevent cache stampede?", "Common techniques include locking or single-flight refresh, stale-while-revalidate, probabilistic early refresh, and adding TTL jitter so many hot keys do not expire simultaneously."],
        ],
        related: ["interview-questions", "distributed-systems-interview-questions", "microservices-interview-questions", "backend-engineer-interview-practice"],
        practiceResource: "software-engineer-mock-interview",
        schema: "TechArticle",
    },
    {
        slug: "distributed-systems-interview-questions",
        path: "/interview-questions/distributed-systems",
        title: "Distributed Systems Interview Questions",
        metaTitle: "Distributed Systems Interview Questions for Engineers | EvalcueAI",
        description: "Prepare for distributed systems interviews across consistency, replication, partitioning, consensus, queues, idempotency, retries, clocks, failures, and observability.",
        eyebrow: "Distributed systems interview questions",
        intro: "Distributed systems interviews test whether you can reason about partial failure and trade-offs. Prepare to explain what happens when machines disagree, messages are duplicated, networks partition, or dependencies become slower than your service target.",
        sections: [
            {
                heading: "Consistency and data questions",
                body: "Be precise about what consistency guarantee the application needs before choosing replication or storage behavior.",
                points: ["Strong vs eventual consistency", "Leader-based replication", "Partitioning and hotspot avoidance", "Quorums and read/write trade-offs"],
            },
            {
                heading: "Messaging and failure questions",
                body: "Queues and service calls introduce retries, duplicates, ordering, backpressure, and ambiguous outcomes.",
                points: ["At-most-once vs at-least-once delivery", "Idempotency and deduplication", "Retry storms and exponential backoff", "Backpressure and dead-letter handling"],
            },
            {
                heading: "Coordination and operations follow-ups",
                body: "Experienced candidates should discuss clocks, leases, leader election, consensus at a conceptual level, split brain, failure detection, observability, and graceful degradation.",
                points: ["CAP trade-offs in a real scenario", "Leader election and consensus", "Clock skew and timeouts", "Metrics, tracing, and failure-domain isolation"],
            },
        ],
        faq: [
            ["What should I study for distributed systems interviews?", "Focus on consistency, replication, partitioning, queues, retries, idempotency, consensus concepts, time and clocks, failure detection, backpressure, observability, and concrete trade-offs."],
            ["Do I need to memorize CAP theorem?", "Know what network partitions imply and how a system chooses behavior during them. Interviewers usually get more signal from a concrete consistency/availability scenario than from reciting the theorem."],
            ["What is the most important distributed-systems mindset?", "Assume partial failure. A remote call can be slow, fail, succeed after your timeout, or be retried. Design protocols and state transitions so the system remains understandable under those conditions."],
        ],
        related: ["interview-questions", "microservices-interview-questions", "redis-interview-questions", "system-design"],
        practiceResource: "system-design-interview-preparation",
        schema: "TechArticle",
    },
    {
        slug: "microservices-interview-questions",
        path: "/interview-questions/microservices",
        title: "Microservices Interview Questions for Backend Engineers",
        metaTitle: "Microservices Interview Questions for Backend Engineers | EvalcueAI",
        description: "Prepare for microservices interviews across service boundaries, communication, data ownership, sagas, idempotency, discovery, resilience, observability, deployment, and trade-offs.",
        eyebrow: "Microservices interview questions",
        intro: "Microservices interviews should be about boundaries and operational trade-offs, not simply naming infrastructure. Prepare to explain when services should be separated, how they communicate, who owns data, and how failures are contained.",
        sections: [
            {
                heading: "Service-boundary questions",
                body: "Start from domain ownership and change patterns rather than splitting a system by technical layers.",
                points: ["How do you choose a service boundary?", "When should a monolith stay a monolith?", "Database per service and data ownership", "API contracts and versioning"],
            },
            {
                heading: "Communication and consistency questions",
                body: "Prepare to compare synchronous calls with events or queues and explain how multi-service workflows remain correct.",
                points: ["REST/gRPC vs asynchronous messaging", "Saga patterns and compensating actions", "Idempotency and duplicate events", "Outbox pattern and reliable event publication"],
            },
            {
                heading: "Reliability and operations follow-ups",
                body: "A microservice architecture adds operational cost. Discuss timeouts, retries, circuit breakers, service discovery, tracing, deployment, configuration, schema evolution, and incident debugging across dependencies.",
                points: ["Timeout and retry budgets", "Circuit breakers and bulkheads", "Distributed tracing", "Independent deployment and rollback"],
            },
        ],
        faq: [
            ["What are common microservices interview questions?", "Expect service boundaries, communication styles, data ownership, distributed transactions, sagas, idempotency, service discovery, resilience, observability, deployment, and when not to use microservices."],
            ["When should you avoid microservices?", "If domain boundaries are unclear, the team is small, independent scaling and deployment are not needed, or operational complexity would dominate the benefits, a modular monolith may be the better choice."],
            ["How do microservices handle transactions across services?", "Prefer local transactions per service and coordinate workflows with patterns such as sagas, idempotent messages, durable events, and compensating actions rather than relying on broad distributed transactions."],
        ],
        related: ["interview-questions", "distributed-systems-interview-questions", "spring-boot-interview-questions", "backend-engineer-interview-practice"],
        practiceResource: "software-engineer-mock-interview",
        schema: "TechArticle",
    },
    {
        slug: "ai-interview-platform",
        path: "/ai-interview-platform",
        title: "AI Interview Platform for Software Engineering",
        metaTitle: `AI Interview Platform for Coding, System Design ${debuggingCopy("& Debugging", "& Technical Interviews")} | EvalcueAI`,
        description: `EvalcueAI is an AI interview platform built for software engineering: coding, system design, ${debuggingCopy("debugging, ")}and technical interviews with adaptive follow-ups, for both candidate practice and structured hiring.`,
        eyebrow: "AI interview platform",
        audience: "Software engineers preparing for technical interviews, and engineering teams that want structured, evidence-based technical assessments with human hiring decisions.",
        intro: `Most AI interview tools are built for general hiring. EvalcueAI is built for engineering: the interviewer runs coding, system-design, ${debuggingCopy("debugging, ")}and technical-discussion rounds, asks follow-ups based on what you actually said, and records the evidence behind every score.`,
        sections: [
            {
                heading: "What EvalcueAI is",
                body: "EvalcueAI has two products that share one interview engine. EvalcueAI Practice lets engineers rehearse realistic interview rounds and review feedback. EvalcueAI Hire lets engineering teams build structured assessments, invite candidates, and review evidence-based scorecards.",
                points: ["EvalcueAI Practice for candidates", "EvalcueAI Hire for engineering teams", "One adaptive interview engine behind both", "Browser-based, with no install required"],
            },
            {
                heading: "How an EvalcueAI interview works",
                body: "Before a round starts, EvalcueAI turns the role, job description, round purpose, and optional resume into an evidence plan: the three to six competencies the round should measure. Each answer is scored against that plan, and the next question targets whichever important competency still has the least evidence.",
                points: ["Evidence plan built from role and job description", "Adaptive follow-ups aimed at the weakest evidence", "Difficulty adjusts one level at a time", "Round ends when competencies are covered, not after a fixed script"],
            },
            {
                heading: "What it can evaluate",
                body: "Each round type collects a different kind of engineering signal, so EvalcueAI treats them as separate rounds with their own competencies. It does not run them as one generic question-and-answer session.",
                points: ["Coding: correctness, complexity, code quality", "System design: requirements, architecture, scale, trade-offs", ...debuggingItems("Debugging: diagnosis and fixes checked by hidden tests"), "Technical depth: trade-offs, failure modes, production judgment"],
            },
        ],
        faq: [
            ["What is EvalcueAI?", `EvalcueAI is an AI interview platform for software engineering. Engineers use it to practice coding, system-design, ${debuggingCopy("debugging, ")}and technical interviews with adaptive AI follow-ups, and hiring teams use it to run structured engineering assessments with human-reviewed scorecards.`],
            ["Is EvalcueAI the same as EvalAI?", "No. EvalAI is an open-source platform for evaluating machine-learning models on benchmarks. EvalcueAI is a separate product for software engineering interview practice and technical hiring."],
            ["Does EvalcueAI make hiring decisions?", "No. EvalcueAI produces evidence and scores. Advance, hold, or reject decisions are recorded by a human reviewer, who must write an evidence note to support the decision."],
        ],
        related: ["ai-interview-evaluation-methodology", "engineering-assessment", "ai-mock-interview"],
        practiceResource: "software-engineer-mock-interview",
        schema: "WebPage",
    },
    {
        slug: "engineering-assessment",
        path: "/engineering-assessment",
        title: "Structured Engineering Assessments with AI Interviews",
        metaTitle: "Engineering Assessment Platform with Adaptive AI Interviews | EvalcueAI",
        description: `Build structured software engineering assessments with coding, system design, ${debuggingCopy("debugging, ")}and adaptive technical interviews, then review evidence-based scorecards with human-controlled hiring decisions.`,
        eyebrow: "Engineering assessments",
        audience: "Engineering managers, hiring managers, and recruiters hiring software engineers who want consistent technical signal without scheduling a live interviewer for every early-stage candidate.",
        intro: `A take-home or a single coding test shows only a small part of how an engineer works. EvalcueAI Hire combines coding, system design, ${debuggingCopy("debugging, ")}and adaptive technical discussion in one structured assessment, and every score links back to what the candidate actually said or wrote.`,
        sections: [
            {
                heading: "Design the assessment around the role",
                body: "Start from a job description or a template, choose the rounds, and set the rubric. EvalcueAI turns each round into weighted competencies so every candidate for the role is measured against the same plan.",
                points: ["Role-specific rounds and weighted competencies", `Coding, system design, ${debuggingCopy("debugging, ")}and discussion rounds`, ...debuggingItems("Multi-file debugging projects with hidden tests"), "Invite-only links, time windows, and time limits"],
            },
            {
                heading: "Adaptive interviews, consistent evidence",
                body: "Follow-up questions target whichever competency has the least evidence so far, and difficulty moves at most one level per question. Candidates get a real conversation, and reviewers get comparable evidence for every competency.",
                points: ["Follow-ups based on candidate answers", "Resume claims probed for ownership and measurement", "Scores with separate confidence levels", "Evidence quotes behind each competency score"],
            },
            {
                heading: "Humans make the hiring decision",
                body: "Reviewers record advance, hold, or reject decisions, and a decision cannot be saved without a written evidence note. Calibration views compare AI scores with reviewer scores for each competency and flag attempts where the two differ by 1.5 points or more.",
                points: ["Human-recorded hiring decisions", "Required evidence notes", "AI-vs-reviewer calibration by competency", "Disagreement queue for review"],
            },
        ],
        faq: [
            ["What is an engineering assessment?", "An engineering assessment is a structured evaluation of a software engineering candidate across the skills the role needs, such as coding, system design, debugging, and technical judgment. Every candidate is measured against the same competencies and rubric."],
            ["How is EvalcueAI different from a coding test?", `A coding test mostly measures whether code passes. EvalcueAI also runs system-design ${debuggingCopy("and debugging ")}rounds and asks adaptive follow-ups about trade-offs, failure modes, and resume claims, then shows the evidence behind each score.`],
            ["Can candidates be rejected automatically?", "No. EvalcueAI does not make employment decisions. A human reviewer records every decision along with a written evidence note."],
        ],
        related: ["ai-interview-platform", "ai-interview-evaluation-methodology", "system-design-interview-practice"],
        practiceResource: "software-engineer-mock-interview",
        cta: { surface: "hiring", path: "/hire", label: "Explore EvalcueAI Hire" },
        schema: "WebPage",
    },
    {
        slug: "ai-interview-evaluation-methodology",
        path: "/ai-interview-evaluation-methodology",
        title: "How EvalcueAI Evaluates Engineering Interviews",
        metaTitle: "AI Interview Evaluation Methodology: Scoring, Follow-ups & Difficulty | EvalcueAI",
        description: `How EvalcueAI plans competencies, scores answers with evidence and confidence, chooses follow-up questions, adapts difficulty, evaluates coding${debuggingCopy(", system design, and debugging", " and system design")}, and keeps hiring decisions with humans.`,
        eyebrow: "Evaluation methodology",
        audience: "Engineers who want to know how their practice answers are judged, and hiring teams deciding whether they can trust EvalcueAI's scorecards.",
        intro: "\"AI-powered\" tells you nothing about how answers are judged. This page explains, step by step, how an EvalcueAI round decides what to measure, how answers are scored, how the next question is chosen, and where a human stays in control.",
        sections: [
            {
                heading: "1. Each round starts with an evidence plan",
                body: "Before the first question, EvalcueAI uses the role, job description, round purpose, and optional resume to select three to six observable competencies for the round. Core competencies can carry more weight, up to 1.5x. Up to six concrete resume claims, such as a migration, a scale figure, or a performance improvement, are marked for verification. If planning fails, standard competency sets for the round type are used instead.",
                points: ["System design: requirements, architecture, data and APIs, scalability and reliability, trade-off reasoning", "Coding: problem solving, correctness, complexity, code quality", "Backend: fundamentals, data and APIs, reliability, technical trade-offs", "Behavioral: ownership, decision quality, communication, execution"],
            },
            {
                heading: "2. Answers are scored on evidence, with separate confidence",
                body: "Each answer is scored from 0 to 10 on the relevant dimensions: technical correctness, depth, trade-off reasoning, communication, and production awareness. Scores may only use evidence that is present in the answer, and every competency score records short quotes or observations that justify it. Confidence is recorded separately from the score, so a thin answer produces low confidence, not just a low score.",
                points: ["No credit for knowledge the candidate did not state", "Evidence observations attached to each score", "Confidence tracked separately from score", "Scores combined across questions into a running estimate"],
            },
            {
                heading: "3. Follow-ups target the weakest evidence",
                body: "The next question goes to the competency with the highest priority, calculated as its weight multiplied by how uncertain its evidence still is, with extra priority when its score so far is low. Resume-claim questions ask about your personal contribution, how the result was measured, the key trade-off, and the hardest failure mode. They are capped at two per round, and generated questions are checked so they don't repeat earlier questions or invent details that aren't in your resume or job description.",
                points: ["Targets the competency with the least evidence", "Probes resume claims for ownership and measurement", "Rejects repeated questions", "Rejects details not in the resume or job description"],
            },
            {
                heading: "4. Difficulty adapts gradually",
                body: "Difficulty runs from 1 to 5 and normally starts at 3, or at 4 for clearly senior roles. After each answer it can move by at most one level: up after strong, high-confidence evidence, and down only after repeated trouble engaging with the question. A single weak answer does not make the rest of the interview easy.",
                points: ["Five-level difficulty scale", "At most one level of change per question", "No drop in difficulty after one weak answer", "Starting level set by role seniority"],
            },
            {
                heading: "5. The round ends when the evidence is sufficient",
                body: "Each round has a minimum and maximum number of questions. It can end early only when weighted coverage across competencies reaches 72% and no important competency still has confidence below 0.35, or when coverage reaches 90%. This avoids both stopping on thin evidence and asking redundant questions.",
                points: ["Minimum number of questions before stopping", "Coverage threshold before ending early", "No important competency left under-evidenced", "Hard maximum question budget"],
            },
            {
                heading: "6. System design is a live, two-way discussion",
                body: "In system-design rounds the AI interviewer follows your spoken or typed discussion and a summary of your architecture canvas. It speaks up only when a real interviewer would: when a requirement is ambiguous, an assumption hasn't been checked, a key choice isn't justified, scale would change the design, a failure mode is being skipped, or a trade-off is claimed without support. If you ask a clarifying question, it answers with a concrete requirement. It never coaches you or reveals an ideal architecture.",
                points: ["Interjection types: clarify, challenge, constraint, scale", "Also: failure, trade-off, security, observability", "Grounded in what you said or drew", "No hints and no ideal answer revealed"],
            },
            {
                heading: `7. Coding ${debuggingCopy("and debugging are", "is")} checked by running code`,
                body: `Coding answers run in a sandboxed execution service that supports JavaScript, Python, Java, and C++, and they are judged on correctness, complexity, and code quality alongside your explanation.${debuggingCopy(" Debugging rounds use realistic multi-file projects. In fix mode, your change is graded against hidden tests you cannot see, and assignments are validated so those tests fail only because of the intended bug. In findings mode, you submit a written diagnosis that is reviewed.")}`,
                points: ["Sandboxed code execution in four languages", ...debuggingItems("Multi-file debugging projects", "Fixes graded by hidden tests", "Assignments validated against unrelated failures")],
            },
            {
                heading: "8. A correct answer is not the same as a good engineering answer",
                body: "Naming a technology that fits can be technically correct and still show little engineering judgment. Scoring keeps correctness separate from depth, trade-off reasoning, and production awareness, so \"use Redis\" scores differently from \"use Redis, because of this read pattern, and here is what happens when it's unavailable\".",
                points: ["Correctness scored separately from depth", "Trade-offs must be explained, not just named", "Failure handling earns production credit", "Communication scored as its own dimension"],
            },
            {
                heading: "9. Humans own every hiring decision",
                body: "In EvalcueAI Hire, AI output is evidence, not a verdict. Reviewers record advance, hold, or reject decisions and must write an evidence note. Calibration views track the average difference between AI and reviewer scores for each competency and queue attempts where they differ by 1.5 points or more, so teams can see where the AI scores too high or too low.",
                points: ["Advance, hold, or reject recorded by a person", "Written evidence note required", "Per-competency AI-vs-reviewer bias tracking", "Disagreement queue for large score gaps"],
            },
        ],
        example: {
            heading: "Example: one answer, three follow-ups",
            intro: "Illustrative exchange from a backend system-design round, showing how a follow-up tests the reasoning behind a technology choice instead of accepting it.",
            turns: [
                ["Candidate", "For the product catalog reads, I'd put Redis in front of the database."],
                ["Interviewer", "Why Redis rather than relying on the database's own cache or read replicas?"],
                ["Candidate", "Reads are about 50 times more frequent than writes and the hot set is small, so an in-memory cache takes most of the load off the primary. Replicas would still pay the query cost."],
                ["Interviewer", "What happens to the system when the Redis cluster becomes unavailable?"],
                ["Candidate", "Reads fall back to the database behind a circuit breaker with request coalescing, so a cold cache doesn't cause a stampede. Latency goes up, but correctness holds."],
                ["Interviewer", "How do you keep the cache consistent when a price changes?"],
            ],
            evaluates: ["Reasoning: why this component fits the access pattern", "Trade-offs: cache vs replicas, latency vs cost", "Failure handling: cache outage and stampede protection", "Scalability: read-to-write ratio and hot set size", "Correctness: consistency when data changes"],
        },
        faq: [
            ["Is AI interview scoring accurate?", "It is evidence-based, not infallible. Scores only credit what the answer contains, carry an explicit confidence level, and in hiring are compared against human reviewer scores so systematic bias shows up in calibration."],
            ["Does EvalcueAI penalize one bad answer?", "One weak answer lowers that competency's estimate. Difficulty can drop by at most one level, and only after repeated trouble engaging, and later questions keep gathering evidence."],
            ["Can EvalcueAI invent questions about my resume?", "Resume questions must be based on claims that actually appear in your resume. Generated questions are checked for details that aren't in your resume or job description, and resume probing is capped at two questions per round."],
            ["Who decides whether a candidate advances?", "A human reviewer. EvalcueAI does not make employment decisions."],
        ],
        related: ["ai-interview-platform", "system-design-interview-practice", debuggingCopy("debugging-interview-practice", "technical-interview-practice")],
        practiceResource: "software-engineer-mock-interview",
        schema: "TechArticle",
    },
    {
        slug: "about",
        path: "/about",
        title: "About EvalcueAI",
        metaTitle: "About EvalcueAI | AI Interview Practice & Technical Hiring for Engineers",
        description: `EvalcueAI is AI interview practice and structured technical hiring for software engineers: coding, system design, ${debuggingCopy("debugging, ")}and technical interviews with adaptive follow-ups.`,
        eyebrow: "About",
        audience: "Engineers preparing for technical interviews and teams looking for a more consistent way to assess candidates.",
        intro: "Technical interviews should reveal how someone approaches a problem. EvalcueAI helps engineers practice that process and helps hiring teams review it through structured assessments, adaptive follow-ups, and feedback grounded in the work submitted.",
        sections: [
            {
                heading: "Products",
                body: "EvalcueAI Practice (practice.evalcueai.com) is for engineers preparing for interviews. EvalcueAI Hire (hiring.evalcueai.com) is for engineering teams running structured technical assessments. The main website and documentation are at evalcueai.com.",
                points: ["EvalcueAI Practice for candidates", "EvalcueAI Hire for hiring teams", "Documentation at evalcueai.com/docs", "Source code on GitHub (srbmaury/EvalcueAI)"],
            },
            {
                heading: "Supported interview types",
                body: "Each round type is a separate interview with its own competencies. Rounds can be combined to match a real interview loop.",
                points: ["Coding with code execution", "Live system design with an architecture canvas", ...debuggingItems("Debugging on multi-file projects with hidden tests"), "Technical, backend, project-depth, and behavioral discussion"],
            },
            {
                heading: "Terminology",
                body: "These terms appear throughout the product and documentation.",
                points: ["Round: one interview segment, such as coding or system design", "Competency: an observable skill a round measures, with a weight", "Evidence: quotes or observations that justify a score", "Scorecard: competency scores, evidence, and the reviewer's decision"],
            },
        ],
        faq: [
            ["Who operates EvalcueAI?", "EvalcueAI is operated by SAURABH MAURYA. You can contact our team through the support and contact links on this website."],
            ["Who is EvalcueAI for?", "Software engineers preparing for technical interviews, and engineering teams hiring software engineers."],
            ["Is there a free plan?", "Yes. The free practice plan includes 3 AI practice interviews per month, with no card required."],
        ],
        related: ["ai-interview-platform", "ai-interview-evaluation-methodology", "engineering-assessment"],
        practiceResource: "software-engineer-mock-interview",
        schema: "AboutPage",
    }
];

export const searchLandingPageForPath = (pathname = "") => SEARCH_LANDING_PAGES.find((page) => page.path === pathname) || null;
export const searchLandingPageForSlug = (slug = "") => SEARCH_LANDING_PAGES.find((page) => page.slug === slug) || null;
export const searchLandingPaths = () => SEARCH_LANDING_PAGES.map((page) => page.path);

import { debuggingCopy, debuggingItems } from "./featureFlags.js";

export const SEARCH_LANDING_PAGES = [
    {
        slug: "ai-interview-practice",
        path: "/ai-interview-practice",
        audience: "Software engineers preparing for technical interviews, from new graduates to senior candidates.",
        example: {
            heading: "Example: a project follow-up",
            intro: "Illustrative exchange from a backend round where the candidate added a resume. The interviewer asks about a claim on the resume, then pushes on the part most people skip.",
            turns: [
                ["Interviewer", "Your resume says you moved order events from a cron job to Kafka. Why was the cron job no longer good enough?"],
                ["Candidate", "It ran every five minutes, so downstream services saw new orders late, and a failed run meant re-scanning the whole orders table."],
                ["Interviewer", "With Kafka, what happens if the inventory consumer crashes after updating stock but before it commits the offset?"],
            ],
            evaluates: [
                "What you personally built",
                "Why the change was needed",
                "Delivery guarantees and duplicate handling",
                "How clearly you explain it",
            ],
        },
        title: "AI Interview Practice for Software Engineers",
        metaTitle: "AI Interview Practice & Mock Interviews for Software Engineers | EvalcueAI",
        description: `Practice software engineering interviews with an AI interviewer that asks follow-ups on your answers: coding, system design, ${debuggingCopy("debugging, ")}backend, and project rounds built from your job description and resume.`,
        eyebrow: "AI interview practice",
        intro: "Knowing an answer and saying it out loud to someone who then asks \"why?\" are different skills. EvalcueAI gives you an interviewer that asks that second question. It builds the session from your target role and resume, follows up on what you actually said, and shows you afterwards where your answers got thin.",
        sections: [
            {
                heading: "Start from the job you're interviewing for",
                body: "Paste the job description and pick the role and level. A backend SDE-2 loop gets API, data, and production questions at SDE-2 depth; a new-grad frontend loop looks quite different. If you add your resume, the interviewer also asks about the projects on it: what you built yourself, how you measured the result, and what you would change now.",
                points: [
                    "Role, level, and job description shape the questions",
                    "Resume projects become follow-up material, if you add a resume",
                    `Coding, system design, ${debuggingCopy("debugging, ")}backend, and behavioral rounds run separately`,
                ],
            },
            {
                heading: "Expect the follow-up",
                body: "In a real interview the first answer is rarely the end of it. After each answer, EvalcueAI looks for the area where it has the least evidence about you and asks there: the edge case you skipped, the assumption behind your traffic estimate, what happens when the dependency you picked goes down. Difficulty moves one step at a time, so one shaky answer doesn't derail the session.",
            },
            {
                heading: "Match the depth to your level",
                body: "At SDE-1, interviewers mostly check fundamentals and clean code. By SDE-2 they expect you to reason about how your code behaves in production. At senior level the conversation turns to ambiguity, trade-offs, and decisions you owned. Set the level you're targeting and the follow-ups probe at that depth.",
            },
            {
                heading: "Review, then repeat the weak round",
                body: "After the session you get the transcript and feedback tied to specific answers: where you missed a requirement, where the complexity analysis was hand-waved, where a choice went unjustified. Pick one of those and run the same round again. A second attempt at one weakness teaches more than five new topics.",
            },
        ],
        faq: [
            ["Is AI interview feedback always correct?", "No. Treat it as coaching evidence rather than an answer key. Check technical claims yourself, and pay most attention to patterns that repeat across sessions."],
            ["Do I have to upload my resume?", "No. Without a resume the questions use only the role and job description. Add one when you want practice on your own projects."],
            ["Can I answer by voice?", "Yes. Technical discussion rounds work by voice or text. Coding rounds use an editor that runs your solution in JavaScript, Python, Java, or C++."],
            ["Is there a free plan?", "Yes. The free plan includes 3 practice interviews a month, with no card required."],
        ],
        related: ["coding-interview-practice", "system-design-interview-practice", "backend-engineer-interview-practice"],
        practiceResource: "software-engineer-mock-interview",
        schema: "WebPage",
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
        intro: "In a system-design round the diagram matters less than the conversation around it. Clarify requirements, sketch the design, explain data flow, and respond when the interviewer pushes on scale, consistency, failures, or trade-offs.",
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
            ["Can I draw diagrams during EvalcueAI system design practice?", "Yes. System-design rounds use a live architecture canvas alongside the interviewer discussion."],
            ["What system design problems should I practice?", "Common starting points include URL shorteners, notification systems, file storage, chat systems, rate limiting, job processing, feeds, and other services that expose different scaling and consistency trade-offs."],
        ],
        related: ["system-design", "backend-engineer-interview-practice", "ai-interview-practice"],
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
            ["Which languages can I code in?", "JavaScript, Python, Java, and C++. Your solution runs in a sandbox, so correctness is checked by running it, and the interviewer then asks about complexity and alternatives."],
            ["Should I memorize coding solutions?", "Memorizing exact solutions is brittle. Learn reusable problem-solving patterns and practice deriving the approach from constraints so you can adapt when the interviewer changes the problem."],
        ],
        related: ["ai-interview-practice", "interview-questions", "backend-engineer-interview-practice"],
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
                body: "Expect questions about decisions more than definitions. Practice explaining how requests flow through a service, how data is stored, what happens under concurrency, and how the system behaves when dependencies fail.",
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
            ["Can I practice Java backend interviews?", "Yes. EvalcueAI already includes Java-oriented practice covering core Java, collections, concurrency, and backend engineering topics."],
            ["Are backend interviews only coding interviews?", "No. Many backend roles combine coding with API and database design, debugging, distributed-systems reasoning, production reliability, and system design."],
        ],
        related: ["system-design-interview-practice", "interview-questions", debuggingCopy("debugging-interview-practice", "ai-interview-practice")],
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
        intro: "Debugging interviews test how you investigate uncertainty. Practice forming hypotheses, collecting evidence, narrowing the failure, validating the root cause, and explaining a safe fix.",
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
            ["How can I get better at debugging interviews?", "Practice narrating a structured investigation. Avoid jumping immediately to a fix; explain what evidence you would inspect, what each observation would imply, and how you would falsify your hypotheses."],
            ["Does EvalcueAI support debugging assessments?", "EvalcueAI Hire supports production-style multi-file debugging assessments, while candidate practice can be configured around debugging and production-reasoning scenarios."],
        ],
        related: ["backend-engineer-interview-practice", "coding-interview-practice", "ai-interview-practice"],
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
            },
            {
                heading: "Prepare for the follow-ups",
                body: "The real signal in a system design interview often appears after the initial diagram. Practice responding when the interviewer changes traffic, consistency, latency, regional, security, or reliability requirements.",
                points: ["Hot keys and hotspots", "Consistency and replication", "Retries and idempotency", "Multi-region and disaster recovery"],
            },
        ],
        faq: [
            ["How should I structure a system design interview?", "A practical flow is requirements, rough scale estimates, APIs, data model, high-level architecture, key bottlenecks, scaling, reliability, security and observability, followed by explicit trade-offs."],
            ["How long should I spend on the initial architecture?", "Avoid spending the entire interview drawing the first diagram. Build a coherent baseline quickly so there is time for the deeper follow-up discussion where many interview signals appear."],
        ],
        related: ["url-shortener-system-design", "rate-limiter-system-design", "google-drive-system-design", "notification-service-system-design", "payment-system-design", "system-design-interview-practice"],
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
        intro: "Use topic-specific question sets to identify gaps, then practice the same area in a mock interview where the follow-ups check whether you can apply the concept to a real scenario.",
        sections: [
            {
                heading: "Start with your primary backend stack",
                body: "For backend roles, depth in the language and framework matters. Practice Java fundamentals and concurrency, Spring Boot service behavior, Redis caching patterns, database and API reasoning, and the failure modes you have seen in production.",
            },
            {
                heading: "Add distributed-systems reasoning",
                body: "Experienced-engineer interviews increasingly ask what happens across service boundaries. Be prepared for consistency, replication, queues, idempotency, retries, partitioning, backpressure, observability, and partial failure.",
            },
            {
                heading: "Turn each answer into a follow-up conversation",
                body: "Definitions are only the beginning. For every topic, practice a scenario, a trade-off, a failure mode, and a question about when you would choose a different approach.",
                points: ["Definition", "Production scenario", "Trade-off", "Failure and debugging follow-up"],
            },
        ],
        faq: [
            ["How should I use interview question lists?", "Use them diagnostically. Answer aloud or in writing, mark weak topics, then practice those areas in scenarios or mock interviews instead of memorizing a long list of canned answers."],
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
                questions: [
                    ["Is Java pass-by-value or pass-by-reference?", "Always pass-by-value. For objects, the value that gets copied is the reference, so a method can change the object it points to but cannot make the caller's variable point to a different object."],
                    ["What is the difference between equals() and ==, and why must hashCode() match equals()?", "For objects, == compares references, while equals() compares logical equality as the class defines it. Objects that are equal must return the same hashCode(); otherwise HashMap and HashSet look in the wrong bucket and fail to find them."],
                    ["When would you use an interface instead of an abstract class?", "Use an interface for a capability that unrelated classes can share, since a class can implement many. Use an abstract class when subclasses share state or constructor logic. Default methods narrowed the gap in Java 8, but only abstract classes can hold instance fields."],
                    ["When should an exception be checked, and when unchecked?", "Checked exceptions suit recoverable conditions the caller is expected to handle, such as a missing file. Unchecked exceptions signal programming errors or failures the caller can't reasonably fix. Many modern codebases lean on unchecked exceptions to keep APIs and lambdas simple."],
                ],
            },
            {
                heading: "Collections and concurrency questions",
                body: "Backend interviews spend a lot of time on how collections behave and what breaks under concurrent access.",
                questions: [
                    ["How does HashMap work, and what happens on a collision?", "The key's hashCode() is spread and masked to pick a bucket. Colliding keys share the bucket as a linked list, which Java 8+ turns into a balanced tree once a bucket holds more than 8 entries and the table has at least 64 buckets. The table doubles when its size passes capacity × load factor (0.75 by default)."],
                    ["ConcurrentHashMap or Collections.synchronizedMap?", "synchronizedMap guards every call with one lock, so threads queue up. ConcurrentHashMap allows concurrent reads and fine-grained locking on writes, and offers atomic compound operations such as computeIfAbsent and merge. Prefer it for shared maps under contention."],
                    ["synchronized or a Lock?", "synchronized is simpler and always releases the lock. ReentrantLock adds tryLock with timeouts, interruptible waits, fairness, and multiple conditions, at the cost of having to unlock in a finally block yourself."],
                    ["Future or CompletableFuture?", "A Future only lets you block on get(). CompletableFuture lets you chain stages with thenApply and thenCompose, combine results, and handle errors without blocking. Give it your own executor for blocking I/O instead of the shared common pool."],
                ],
            },
            {
                heading: "JVM and production follow-ups",
                body: "For experienced roles, prepare to discuss heap versus stack, garbage collection, memory leaks, thread pools, blocking calls, immutability, and how you would diagnose a Java service under load.",
                questions: [
                    ["What is the difference between the JDK, JRE, and JVM?", "The JVM runs bytecode. The JRE is the JVM plus the standard libraries needed to run programs. The JDK adds the compiler and developer tools. Since Java 11 the JDK is the normal download and a separate JRE is rarely shipped."],
                    ["What lives on the heap and what lives on the stack?", "Each thread's stack holds method frames with local primitives and references. Objects live on the shared heap and stay there until no live reference reaches them, after which the garbage collector can reclaim them."],
                    ["What causes long GC pauses, and how would you reduce them?", "Usually a high allocation rate, a heap that is too small, or large old-generation collections. Read the GC logs first, then cut allocation in hot paths, size the heap properly, tune G1, or move to a low-pause collector such as ZGC."],
                    ["A Java service is at 100% CPU. How do you find out why?", "Find the busiest threads (for example with top -H), take a few thread dumps with jstack or jcmd, and match the hot thread IDs to their stack traces. A profiler such as async-profiler or Java Flight Recorder then shows which methods use the CPU. Check GC logs to rule out GC thrashing."],
                ],
            },
        ],
        faq: [
            ["Should I memorize HashMap internals?", "Understand the behavior and why it matters: hashing, bucket selection, collisions, equality, resizing, complexity, and thread-safety limitations. Memorizing implementation trivia without reasoning is less useful."],
            ["How do I practice Java interview follow-ups?", "After answering a concept question, add a scenario: concurrency, performance, failure, testing, or API design. EvalcueAI's Java practice track asks those follow-ups for you."],
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
                questions: [
                    ["How does Spring Boot auto-configuration work?", "Starters put libraries on the classpath, and auto-configuration classes create beans conditionally using annotations like @ConditionalOnClass and @ConditionalOnMissingBean. If you define your own bean of the same type, the default backs off."],
                    ["What is the difference between @Component, @Service, @Repository, and @Bean?", "The first three mark classes for component scanning; @Repository also translates persistence exceptions into Spring's DataAccessException hierarchy. @Bean goes on a method in a @Configuration class and is how you register objects you don't own, such as third-party clients."],
                    ["Why is constructor injection preferred over field injection?", "Dependencies become explicit and can be final, the object can never exist half-built, and you can create it in a unit test without a Spring context. Field injection hides dependencies and needs reflection to test."],
                    ["What happens when a Spring Boot application starts?", "SpringApplication prepares the environment and loads properties, creates the application context, runs component scanning and auto-configuration, creates singleton beans and their dependencies, starts the embedded web server, and finally runs any ApplicationRunner and CommandLineRunner beans."],
                ],
            },
            {
                heading: "Web, data, and transaction questions",
                body: "Backend interviews commonly move from controllers into persistence and transaction boundaries.",
                questions: [
                    ["How do you validate a request body in a REST controller?", "Put Bean Validation constraints such as @NotNull or @Size on the DTO fields and mark the controller parameter with @Valid. Failures raise MethodArgumentNotValidException, which a @ControllerAdvice can turn into a consistent 400 response."],
                    ["Why does @Transactional sometimes not work?", "It works through a proxy, so a call from one method to another in the same class skips it, and private methods aren't intercepted. By default it also rolls back only on unchecked exceptions unless you set rollbackFor."],
                    ["What is the JPA N+1 problem and how do you fix it?", "Loading N parents and then lazily touching each one's association fires one query for the list plus one per parent. Fix it with a fetch join, an @EntityGraph, or batch fetching, and catch it early by logging SQL in tests."],
                    ["How do you handle exceptions consistently across controllers?", "Put @ExceptionHandler methods in a @RestControllerAdvice class that maps exception types to status codes and one standard error body. Spring Boot 3 also supports RFC 7807 ProblemDetail responses out of the box."],
                ],
            },
            {
                heading: "Production and testing follow-ups",
                body: "For experienced roles, prepare for Actuator, metrics, security filters, integration testing, connection pools, retries, circuit breakers, asynchronous work, and how you would investigate a slow Spring service.",
                questions: [
                    ["Unit test, slice test, or integration test?", "Unit tests build the class directly with mocks and run in milliseconds. Slice tests such as @WebMvcTest or @DataJpaTest load one layer. @SpringBootTest loads the whole context, ideally against real dependencies via Testcontainers. Write mostly unit tests and a few of the others."],
                    ["What does Actuator give you in production?", "Health, info, and metrics endpoints, with Micrometer exporting metrics to systems like Prometheus. The liveness and readiness health groups map directly to Kubernetes probes. Expose only what you need and secure the rest."],
                    ["How does a request pass through Spring Security?", "It goes through a chain of servlet filters before reaching the DispatcherServlet. Authentication filters build an Authentication object and store it in the SecurityContext, then authorization rules decide whether the request may reach the controller."],
                    ["A Spring endpoint is slow. Where do you look?", "Start with traces or metrics to see where the time goes. Common causes are slow or N+1 queries, an exhausted HikariCP connection pool, calls to other services without timeouts, and saturated thread pools."],
                ],
            },
        ],
        faq: [
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
                questions: [
                    ["Why is Redis fast?", "Data lives in memory, commands run on a single main thread so there is no lock contention, network I/O is multiplexed through an event loop, and the data structures are compact. The network round trip usually costs more than the command."],
                    ["Which Redis data structures would you use, and for what?", "Strings for counters and cached values, hashes for objects, lists for simple queues, sets for membership checks, sorted sets for leaderboards and time-ordered data, and streams for durable event logs with consumer groups."],
                    ["How does key expiration work?", "Expired keys are removed lazily when someone accesses them, and actively by a background job that samples keys with a TTL. So memory from expired keys can linger briefly, and replicas wait for the primary to propagate deletions."],
                    ["RDB or AOF persistence?", "RDB writes periodic snapshots, which are compact and quick to restore but lose the writes since the last snapshot. AOF logs every write; with fsync every second you lose at most about a second of data, at the cost of larger files. Many setups enable both."],
                ],
            },
            {
                heading: "Caching interview questions",
                body: "Caching questions usually move quickly to invalidation and what happens when things fail.",
                questions: [
                    ["Cache-aside or write-through?", "With cache-aside, the application reads the cache, falls back to the database on a miss, and fills the cache. With write-through, every write updates the cache and the database together. Cache-aside is simpler and more common; write-through keeps the cache fresher but caches data that may never be read."],
                    ["What is a cache stampede and how do you prevent it?", "When a hot key expires, many requests miss at once and all hit the database. Prevent it with a lock or single-flight so one request rebuilds the value, by serving stale data while refreshing, or by refreshing shortly before expiry."],
                    ["How do you deal with hot keys and keys that expire together?", "Add random jitter to TTLs so keys don't expire at the same moment. For one very hot key, keep a short-lived local copy in each app instance or replicate the key under several names to spread the reads."],
                    ["What happens when Redis runs out of memory?", "It follows maxmemory-policy. With noeviction, writes start failing. Cache workloads usually use allkeys-lru or allkeys-lfu so the least useful keys are evicted. Watch evicted_keys and memory fragmentation."],
                ],
            },
            {
                heading: "Scaling and distributed follow-ups",
                body: "Prepare for replication, Sentinel, Cluster, pipelining, transactions or Lua for atomicity, distributed-lock caveats, and how the application behaves when Redis is slow or unavailable.",
                questions: [
                    ["How do replication and failover work?", "Replicas copy the primary asynchronously, so a failover can lose the most recent writes. Redis Sentinel watches the primary and promotes a replica when it fails; Redis Cluster does the same for each shard."],
                    ["How does Redis Cluster split data?", "Each key maps to one of 16,384 hash slots by CRC16, and the slots are spread across primaries. Multi-key commands only work when all keys share a slot, which you can force with hash tags such as {user:42}."],
                    ["Pipelining, MULTI/EXEC, or a Lua script?", "Pipelining batches commands to save round trips but gives no atomicity. MULTI/EXEC runs a queued batch atomically, with WATCH for optimistic locking. A Lua script runs atomically and can branch on values it reads, which makes it the usual choice for check-then-set logic such as a rate limiter."],
                    ["What should the application do when Redis is slow or down?", "Set tight timeouts, wrap calls in a circuit breaker, and fall back to the database with request coalescing so a cold cache doesn't flood it. Decide in advance which features can degrade and which must fail."],
                ],
            },
        ],
        faq: [
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
                questions: [
                    ["Strong or eventual consistency?", "Strong consistency means every read sees the latest write, which costs latency and availability during failures. Eventual consistency lets replicas lag and catch up later. Decide per operation: an account balance needs the first, a like counter can live with the second."],
                    ["How does leader-based replication work, and what can go wrong?", "One leader accepts writes and streams them to followers. With asynchronous replication, a leader failure can lose writes that were already acknowledged, and reads from followers can be stale. Replicating synchronously to at least one follower trades latency for durability."],
                    ["How do you partition data and avoid hotspots?", "Hash partitioning spreads keys evenly but makes range queries expensive; range partitioning keeps ranges together but can create hot partitions. For heavily skewed keys, add a random suffix to spread writes or split the hot partition."],
                    ["What do quorums give you?", "With N replicas, writing to W and reading from R where W + R > N means every read overlaps at least one up-to-date replica. Lowering W or R improves latency and availability at the cost of possibly stale reads."],
                ],
            },
            {
                heading: "Messaging and failure questions",
                body: "Queues and service calls introduce retries, duplicates, ordering, backpressure, and ambiguous outcomes.",
                questions: [
                    ["At-most-once, at-least-once, or exactly-once delivery?", "At-most-once can lose messages and at-least-once can duplicate them. Exactly-once delivery over a network isn't achievable in general, so systems combine at-least-once delivery with idempotent processing to get exactly-once effects."],
                    ["How do you make a consumer idempotent?", "Give every message a stable ID and record processed IDs in the same transaction as the side effect, or design the operation so applying it twice has no extra effect, for example setting a value instead of incrementing it."],
                    ["What is a retry storm and how do you prevent it?", "When a struggling service makes every client retry at once, load multiplies and the service never recovers. Use exponential backoff with jitter, cap the number of retries, and give each client a retry budget."],
                    ["What is backpressure, and what do you do with messages that keep failing?", "Backpressure means slowing producers down when consumers fall behind, through bounded queues or rate limits, instead of buffering forever. Messages that fail repeatedly go to a dead-letter queue so they stop blocking the rest and can be inspected."],
                ],
            },
            {
                heading: "Coordination and operations follow-ups",
                body: "Experienced candidates should discuss clocks, leases, leader election, consensus at a conceptual level, split brain, failure detection, observability, and graceful degradation.",
                questions: [
                    ["How does CAP play out in a real system?", "During a network partition a system must either reject some requests to stay consistent or keep serving and risk the copies diverging. A payment ledger usually chooses consistency; a shopping cart or feed usually chooses availability and reconciles later."],
                    ["How do leader election and consensus work at a high level?", "Algorithms such as Raft elect a leader by majority vote and commit a log entry only once a majority has stored it, so any two majorities overlap and agree on history. Most teams rely on etcd or ZooKeeper instead of implementing this themselves."],
                    ["Why can't you rely on clocks across machines?", "Clocks drift and can jump when NTP corrects them, so timestamps from different machines can't safely order events. Use logical or vector clocks for ordering, and fencing tokens instead of wall-clock leases for safety."],
                    ["How do you observe and contain failures?", "Use distributed tracing to follow a request across services, plus metrics for latency, errors, and saturation. Contain failures with timeouts and bulkheads so one failing dependency can't take everything else down with it."],
                ],
            },
        ],
        faq: [
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
        intro: "Microservices interviews are mostly about boundaries and operational cost. Prepare to explain when services should be separated, how they communicate, who owns data, and how failures are contained.",
        sections: [
            {
                heading: "Service-boundary questions",
                body: "Interviewers want to hear how you decide where one service ends and the next begins.",
                questions: [
                    ["How do you choose a service boundary?", "Draw boundaries around business capabilities that change together and own their data, rather than around technical layers. If two services always deploy together or call each other on every request, the boundary is probably in the wrong place."],
                    ["When should a monolith stay a monolith?", "When the team is small, the domain is still changing, or nothing needs to scale or deploy on its own. A modular monolith with clear internal boundaries is cheaper to run and easier to split later."],
                    ["Why does each service own its database?", "Shared tables couple services through schema changes and hidden dependencies. With one owner per dataset, other services go through its API or events, so the owner can change its storage without breaking anyone."],
                    ["How do you version a service API?", "Make additive, backward-compatible changes by default and have clients ignore unknown fields. Introduce a new version only for breaking changes, run old and new side by side until consumers move, and use contract tests to catch breaks."],
                ],
            },
            {
                heading: "Communication and consistency questions",
                body: "Prepare to compare synchronous calls with events or queues and explain how multi-service workflows remain correct.",
                questions: [
                    ["Synchronous calls or asynchronous messaging?", "Use REST or gRPC when the caller needs an answer now. Use events or queues when the work can happen later or several services react to one change; that decouples their availability at the cost of eventual consistency and harder debugging."],
                    ["What is a saga?", "A sequence of local transactions across services where each step has a compensating action that undoes it if a later step fails. An orchestrator can drive the steps, or services can react to each other's events (choreography)."],
                    ["How do you handle duplicate events?", "Assume at-least-once delivery. Include an event ID, have consumers record the IDs they have processed, and write handlers so applying the same event twice changes nothing."],
                    ["What problem does the outbox pattern solve?", "Saving to the database and publishing an event are two separate operations, so one can succeed while the other fails. The outbox writes the event to a table in the same transaction as the data change, and a relay or change-data-capture process publishes it afterwards."],
                ],
            },
            {
                heading: "Reliability and operations follow-ups",
                body: "A microservice architecture adds operational cost. Discuss timeouts, retries, circuit breakers, service discovery, tracing, deployment, configuration, schema evolution, and incident debugging across dependencies.",
                questions: [
                    ["How do you set timeouts and retries between services?", "Every remote call needs a timeout shorter than the caller's own deadline. Retry only idempotent operations, with backoff and jitter, and retry at one layer only so attempts don't multiply down the call chain."],
                    ["What are circuit breakers and bulkheads?", "A circuit breaker stops calling a dependency that keeps failing and fails fast until it recovers. A bulkhead gives each dependency its own pool of threads or connections so one slow dependency can't exhaust them all."],
                    ["How do you debug a request that crosses many services?", "Propagate a trace ID through every call and message and use distributed tracing, such as OpenTelemetry, to see each hop's latency and errors. Put the trace ID in structured logs so you can jump from a trace to the logs."],
                    ["How do you deploy and roll back services independently?", "Keep APIs and schemas backward compatible across a release, use expand-and-contract for database changes, and roll out gradually with canaries or feature flags so a bad version can be rolled back without coordinating with other teams."],
                ],
            },
        ],
        faq: [
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
                points: ["Evidence plan built from role and job description", "Adaptive follow-ups aimed at the weakest evidence", "Difficulty adjusts one level at a time", "Round ends once the competencies are covered"],
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
        related: ["ai-interview-evaluation-methodology", "engineering-assessment", "ai-interview-practice"],
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
                points: ["Correctness scored separately from depth", "Trade-offs must be explained to earn credit", "Failure handling earns production credit", "Communication scored as its own dimension"],
            },
            {
                heading: "9. Humans own every hiring decision",
                body: "In EvalcueAI Hire, AI output is evidence for a reviewer to weigh. Reviewers record advance, hold, or reject decisions and must write an evidence note. Calibration views track the average difference between AI and reviewer scores for each competency and queue attempts where they differ by 1.5 points or more, so teams can see where the AI scores too high or too low.",
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
            ["Is AI interview scoring accurate?", "It can be wrong. Scores only credit what the answer contains, carry an explicit confidence level, and in hiring are compared against human reviewer scores so systematic bias shows up in calibration."],
            ["Does EvalcueAI penalize one bad answer?", "One weak answer lowers that competency's estimate. Difficulty can drop by at most one level, and only after repeated trouble engaging, and later questions keep gathering evidence."],
            ["Can EvalcueAI invent questions about my resume?", "Resume questions must be based on claims that actually appear in your resume. Generated questions are checked for details that aren't in your resume or job description, and resume probing is capped at two questions per round."],
            ["Who decides whether a candidate advances?", "A human reviewer. EvalcueAI does not make employment decisions."],
        ],
        related: ["ai-interview-platform", "system-design-interview-practice", debuggingCopy("debugging-interview-practice", "ai-interview-practice")],
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
        intro: "EvalcueAI is a place to rehearse software engineering interviews with an interviewer that asks follow-up questions, and a way for engineering teams to run a structured first technical round without booking an engineer for every candidate.",
        sections: [
            {
                heading: "What it is",
                body: `There are two products on one interview engine. EvalcueAI Practice (practice.evalcueai.com) is for engineers preparing for interviews: coding, system design, ${debuggingCopy("debugging, ")}and technical discussion rounds built from the job they are applying for. EvalcueAI Hire (hiring.evalcueai.com) is for engineering teams who want every candidate for a role assessed the same way, with a person making each hiring decision.`,
            },
            {
                heading: "Who runs it",
                body: "EvalcueAI is built and run by Saurabh Maurya. The source code is public on GitHub at github.com/srbmaury/EvalcueAI, and the evaluation methodology page explains how answers are scored, how follow-up questions are chosen, and where a human stays in control.",
            },
            {
                heading: "Pricing",
                body: "Practice has a free plan with 3 interviews a month and no card required, and a Pro plan for heavier preparation. Hire starts with a one-time pilot before any monthly plan. Current prices are on the pricing page.",
            },
            {
                heading: "Contact",
                body: "Questions, bug reports, and feedback go to contact@evalcueai.com.",
            },
        ],
        faq: [],
        related: ["ai-interview-evaluation-methodology", "ai-interview-practice", "engineering-assessment"],
        practiceResource: "software-engineer-mock-interview",
        schema: "AboutPage",
    }
];

export const searchLandingPageForPath = (pathname = "") => SEARCH_LANDING_PAGES.find((page) => page.path === pathname) || null;
export const searchLandingPageForSlug = (slug = "") => SEARCH_LANDING_PAGES.find((page) => page.slug === slug) || null;
export const searchLandingPaths = () => SEARCH_LANDING_PAGES.map((page) => page.path);

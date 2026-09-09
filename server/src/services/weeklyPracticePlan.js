const languageLabel = {
    javascript: "JavaScript",
    python: "Python",
    cpp: "C++",
    java: "Java",
};

const goalContext = {
    "get-first-role": "Keep the interview practical and foundational, with clear opportunities to demonstrate readiness for the role.",
    "switch-role": "Emphasize transferable experience and the role-specific gaps the candidate needs to close.",
    promotion: "Use senior-level scope, trade-offs, ownership, and leadership expectations.",
    confidence: "Keep the session focused enough to complete in one sitting while still using realistic follow-up questions.",
    other: "Keep the session focused on realistic role-specific interview expectations.",
};

const tracks = {
    backend: [
        { title: "System design", focus: "distributed systems, APIs, data modeling, caching, queues, consistency, scalability, observability, and trade-offs" },
        { title: "Backend coding", focus: "production-quality service code, concurrency, API behavior, error handling, testing, and performance" },
        { title: "Backend behavioral", focus: "ownership, production incidents, debugging, technical decisions, collaboration, and measurable impact" },
        { title: "Databases & performance", focus: "SQL and data modeling, indexing, transactions, query performance, caching, and capacity trade-offs" },
        { title: "Reliability & observability", focus: "SLIs/SLOs, metrics, logs, tracing, alerting, failure modes, graceful degradation, and incident response" },
        { title: "API & security", focus: "API design, authentication, authorization, idempotency, rate limiting, validation, and abuse prevention" },
        { title: "Architecture deep dive", focus: "service boundaries, asynchronous workflows, consistency models, deployment, scaling bottlenecks, and migrations" },
    ],
    frontend: [
        { title: "Frontend architecture", focus: "component boundaries, state management, rendering strategy, accessibility, performance, testing, and API integration" },
        { title: "Frontend coding", focus: "clean UI logic, async state, edge cases, data transformations, testing, and maintainable component design" },
        { title: "Frontend behavioral", focus: "product ownership, debugging, cross-functional decisions, performance improvements, and user impact" },
        { title: "Web performance", focus: "Core Web Vitals, bundle strategy, caching, rendering, network waterfalls, profiling, and regressions" },
        { title: "UI systems", focus: "design systems, accessibility, reusable components, forms, validation, responsive behavior, and testing" },
        { title: "Frontend reliability", focus: "error boundaries, monitoring, rollout safety, browser compatibility, API failures, and recovery UX" },
        { title: "Architecture deep dive", focus: "micro-frontends, routing, data fetching, caching, SSR/CSR trade-offs, and large-scale frontend evolution" },
    ],
    mobile: [
        { title: "Mobile architecture", focus: "offline-first design, local persistence, synchronization, networking, background work, state management, and performance" },
        { title: "Mobile coding", focus: "clean application logic, concurrency, lifecycle edge cases, persistence, testing, and performance" },
        { title: "Mobile behavioral", focus: "ownership, debugging difficult device issues, release quality, collaboration, and measurable user impact" },
        { title: "Offline & sync", focus: "conflict resolution, retries, caching, local databases, eventual consistency, and failure recovery" },
        { title: "Performance & reliability", focus: "startup time, memory, battery, crashes, networking, profiling, and observability" },
        { title: "Platform integration", focus: "permissions, security, background execution, notifications, deep links, and OS constraints" },
        { title: "Architecture deep dive", focus: "modularity, data flow, dependency boundaries, testing strategy, rollout safety, and long-term maintainability" },
    ],
    data: [
        { title: "Data/ML system design", focus: "data pipelines, feature generation, training, serving, freshness, scalability, monitoring, and feedback loops" },
        { title: "Coding & data", focus: "data transformations, algorithms, SQL, correctness, testing, performance, and production edge cases" },
        { title: "Data/ML behavioral", focus: "experiment ownership, ambiguous requirements, model or pipeline failures, collaboration, and measurable impact" },
        { title: "Model evaluation", focus: "offline metrics, online experiments, bias, drift, error analysis, guardrails, and business trade-offs" },
        { title: "Data reliability", focus: "schema evolution, data quality, lineage, observability, backfills, retries, and failure recovery" },
        { title: "Serving & performance", focus: "latency, throughput, caching, batch versus online serving, cost, capacity, and degradation strategies" },
        { title: "Architecture deep dive", focus: "system boundaries, orchestration, storage choices, consistency, deployment, and long-term evolution" },
    ],
    general: [
        { title: "System design", focus: "requirements, APIs, data modeling, scalability, reliability, caching, asynchronous workflows, and trade-offs" },
        { title: "Coding", focus: "problem solving, clean implementation, edge cases, testing, complexity, and production-quality reasoning" },
        { title: "Behavioral", focus: "ownership, collaboration, difficult decisions, debugging, conflict resolution, and measurable impact" },
        { title: "Debugging & reliability", focus: "failure isolation, logs, metrics, testing, incident response, and preventing recurrence" },
        { title: "Data & performance", focus: "data modeling, indexes, caching, bottlenecks, concurrency, latency, and capacity planning" },
        { title: "API & security", focus: "API contracts, validation, authentication, authorization, rate limiting, idempotency, and abuse prevention" },
        { title: "Architecture deep dive", focus: "boundaries, dependencies, deployment, migrations, scaling constraints, and long-term maintainability" },
    ],
};

const inferTrack = (role = "") => {
    const value = role.toLowerCase();
    if (/android|ios|mobile/.test(value)) return "mobile";
    if (/frontend|front-end|react|web ui|ui engineer/.test(value)) return "frontend";
    if (/data|machine learning|ml engineer|ai engineer|analytics/.test(value)) return "data";
    if (/backend|back-end|platform|distributed|infrastructure|infra|devops|site reliability|sre/.test(value)) return "backend";
    return "general";
};

const inferDifficulty = (role = "") => {
    const value = role.toLowerCase();
    if (/principal|staff|architect/.test(value)) return "staff-level";
    if (/senior|lead|sde[ -]?2|sde[ -]?ii/.test(value)) return "senior-level";
    if (/junior|entry|associate|sde[ -]?1|sde[ -]?i/.test(value)) return "early-career";
    return "role-appropriate";
};

export const buildWeeklyPracticePlan = (user = {}) => {
    const targetRole = String(user.targetRole || "Software Engineer").trim() || "Software Engineer";
    const weeklyTarget = Math.min(7, Math.max(1, Number(user.weeklyPracticeTarget) || 3));
    const language = languageLabel[user.preferredProgrammingLanguage] || user.preferredProgrammingLanguage || "your preferred language";
    const difficulty = inferDifficulty(targetRole);
    const goal = goalContext[user.practiceGoal] || goalContext.confidence;
    const templates = tracks[inferTrack(targetRole)];

    return templates.slice(0, weeklyTarget).map((template, index) => {
        const codingContext = /coding|data|performance/.test(template.title.toLowerCase()) ? ` Use ${language} where coding is relevant.` : "";
        const jobDescription = [
            `This is a ${difficulty} practice interview for a ${targetRole}.`,
            `Primary session: ${template.title}.`,
            `Focus on ${template.focus}.`,
            goal,
            `${codingContext} Ask realistic follow-ups and require the candidate to explain trade-offs, assumptions, and production implications.`.trim(),
        ].join(" ");

        return {
            id: `session-${index + 1}`,
            number: index + 1,
            title: `${targetRole} — ${template.title}`,
            interviewType: template.title,
            focus: template.focus,
            jobRole: targetRole,
            jobDescription,
        };
    });
};

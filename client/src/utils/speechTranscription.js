// Helpers for accurate interview transcription: the browser recognition locale and the vocabulary
// hint sent with server transcription requests.

// Browser speech recognition is far less accurate when the locale does not match the speaker's
// accent (for example Indian English under en-US). Prefer the user's own English locale.
export const recognitionLanguage = (languages = typeof navigator !== "undefined" ? (navigator.languages || [navigator.language]) : []) => {
    const english = (languages || []).find((value) => /^en(-[A-Za-z]{2})?$/i.test(String(value || "")));
    if (!english) return "en-US";
    const [base, region] = english.split("-");
    return region ? `${base.toLowerCase()}-${region.toUpperCase()}` : "en-US";
};

// Terms speech models commonly mis-hear in engineering interviews. Listing them in the prompt biases
// the model toward the correct spelling ("Kafka", not "Kafca"; "idempotency", not "item potency").
const ENGINEERING_TERMS = [
    "API", "REST", "gRPC", "GraphQL", "JSON", "SQL", "NoSQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Kafka",
    "RabbitMQ", "DynamoDB", "Cassandra", "Elasticsearch", "S3", "CDN", "Kubernetes", "k8s", "Docker", "AWS", "GCP",
    "Azure", "microservices", "idempotency", "idempotent", "sharding", "partitioning", "replication", "consistent hashing",
    "CAP theorem", "eventual consistency", "p99", "latency", "throughput", "QPS", "TPS", "rate limiter", "load balancer",
    "circuit breaker", "backpressure", "TTL", "LRU", "cache invalidation", "OAuth", "JWT", "TLS", "CI/CD", "O(n log n)",
    "hash map", "binary search", "BFS", "DFS", "Java", "Spring Boot", "Node.js", "TypeScript", "React", "Python", "Go",
];

const clip = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

// Technical-looking words from the question: hyphenated or dotted identifiers, CamelCase, acronyms.
const TECHNICAL_WORD = /\b[A-Za-z][A-Za-z0-9]*(?:[-./][A-Za-z0-9]+)+\b|\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b|\b[A-Z]{2,}[A-Za-z0-9]*\b/g;

// A glossary only, never the question itself: given a question, transcription models may answer it or
// echo it when a chunk of audio contains no speech, which would put words in the candidate's mouth.
export const buildTranscriptionHint = ({ role = "", question = "" } = {}) => {
    const fromQuestion = String(question || "").match(TECHNICAL_WORD) || [];
    const terms = [...new Set([clip(role, 80), ...fromQuestion.slice(0, 12), ...ENGINEERING_TERMS].filter(Boolean))];
    return `Glossary: ${terms.join(", ")}.`.slice(0, 800);
};

// Replace the last occurrence of `previous` with `next`. Used to swap a segment's live browser text
// for the more accurate server transcript; returns the input unchanged when the text is gone.
export const replaceLastOccurrence = (text = "", previous = "", next = "") => {
    const source = String(text || "");
    const from = String(previous || "").trim();
    if (!from) return source;
    const index = source.lastIndexOf(from);
    if (index < 0) return source;
    return `${source.slice(0, index)}${String(next || "").trim()}${source.slice(index + from.length)}`;
};

// Only correct when the server heard something meaningfully different, ignoring case and punctuation.
const comparable = (value) => String(value || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
export const transcriptsDiffer = (a, b) => comparable(a) !== comparable(b);

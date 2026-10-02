import client from "prom-client";

// Default metrics
client.collectDefaultMetrics();

// HTTP
export const httpRequestsTotal = new client.Counter({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "route", "status"],
});

export const httpRequestDurationSeconds = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status"],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});
export const httpRequestsInFlight = new client.Gauge({ name: "http_requests_in_flight", help: "HTTP requests currently being processed", labelNames: ["method"] });
export const httpResponseSizeBytes = new client.Histogram({ name: "http_response_size_bytes", help: "HTTP response size in bytes", labelNames: ["method", "route", "status"], buckets: [256, 1024, 4096, 16384, 65536, 262144, 1048576] });
export const httpRequestTimeoutsTotal = new client.Counter({ name: "http_request_timeouts_total", help: "HTTP requests closed before a response completed", labelNames: ["method", "route"] });

// Security and errors
export const rateLimitHitsTotal = new client.Counter({ name: "rate_limit_hits_total", help: "Rate limit hits", labelNames: ["route"] });
export const csrfDeniedTotal = new client.Counter({ name: "csrf_denied_total", help: "CSRF denials", labelNames: ["route"] });
export const originDeniedTotal = new client.Counter({ name: "origin_denied_total", help: "Origin/Referer denials", labelNames: ["route"] });
export const errorsTotal = new client.Counter({ name: "errors_total", help: "Unhandled errors", labelNames: ["status", "route"] });
export const authorizationDeniedTotal = new client.Counter({ name: "authorization_denied_total", help: "Authorization denials", labelNames: ["reason", "route"] });

// Auth
export const authLoginAttemptsTotal = new client.Counter({
    name: "auth_login_attempts_total",
    help: "Login attempts",
    labelNames: ["provider", "outcome"], // provider: local|google; outcome: success|failure|blocked
});
export const authRegisterTotal = new client.Counter({ name: "auth_register_total", help: "Register attempts", labelNames: ["outcome"] });
export const authVerifyTotal = new client.Counter({ name: "auth_verify_total", help: "Email verify actions", labelNames: ["type", "outcome"] }); // type: verify|resend
export const authResetTotal = new client.Counter({ name: "auth_reset_total", help: "Password reset actions", labelNames: ["action", "outcome"] }); // action: forgot|reset
export const authLogoutTotal = new client.Counter({ name: "auth_logout_total", help: "Logout count" });
export const securityPasswordChangeTotal = new client.Counter({ name: "security_password_change_total", help: "Password changes", labelNames: ["outcome"] });

// Features
export const uploadResumeTotal = new client.Counter({ name: "upload_resume_total", help: "Resume uploads", labelNames: ["outcome"] });
export const sttTranscribeTotal = new client.Counter({ name: "stt_transcribe_total", help: "STT transcriptions", labelNames: ["outcome"] });
export const runCodeTotal = new client.Counter({ name: "run_code_total", help: "Code executions", labelNames: ["language", "outcome", "errorType"] });
export const codeRunnerRuntimeAvailable = new client.Gauge({ name: "code_runner_runtime_available", help: "Whether the code runner reports a runtime as executable", labelNames: ["runtime"] });
export const quotasDeniedTotal = new client.Counter({ name: "quotas_denied_total", help: "Per-user quota denials", labelNames: ["actionKey"] });

// Tokens / sessions
export const tokensRotatedTotal = new client.Counter({ name: "tokens_rotated_total", help: "Refresh tokens rotated" });
export const sessionsRevokedTotal = new client.Counter({ name: "sessions_revoked_total", help: "Sessions revoked", labelNames: ["scope"] }); // scope: one|all

// Dependencies and asynchronous work
export const componentReady = new client.Gauge({ name: "component_ready", help: "Whether a required component is ready", labelNames: ["component"] });
export const dependencyOperationDurationSeconds = new client.Histogram({ name: "dependency_operation_duration_seconds", help: "Dependency operation duration", labelNames: ["component", "operation", "outcome"], buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10] });
export const queueJobsTotal = new client.Counter({ name: "queue_jobs_total", help: "Queue jobs by terminal outcome", labelNames: ["queue", "outcome"] });
export const queueJobDurationSeconds = new client.Histogram({ name: "queue_job_duration_seconds", help: "Queue job processing duration", labelNames: ["queue", "outcome"], buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120] });
export const queueDepth = new client.Gauge({ name: "queue_depth", help: "Queue jobs by state", labelNames: ["queue", "state"] });
export const queueRetriesTotal = new client.Counter({ name: "queue_retries_total", help: "Queue jobs that will be retried", labelNames: ["queue"] });

// AI, reminders, billing, and product funnel
export const aiRequestsTotal = new client.Counter({ name: "ai_requests_total", help: "AI provider requests", labelNames: ["provider", "model", "outcome"] });
export const aiRequestDurationSeconds = new client.Histogram({ name: "ai_request_duration_seconds", help: "AI request duration", labelNames: ["provider", "model", "outcome"], buckets: [0.25, 0.5, 1, 2, 5, 10, 20, 40, 120] });
export const aiTokensTotal = new client.Counter({ name: "ai_tokens_total", help: "AI tokens reported by providers", labelNames: ["provider", "model", "type"] });
export const aiFallbacksTotal = new client.Counter({ name: "ai_fallbacks_total", help: "AI provider fallbacks", labelNames: ["from", "to"] });
export const aiInvalidResponsesTotal = new client.Counter({ name: "ai_invalid_responses_total", help: "AI responses that were empty or invalid", labelNames: ["provider", "model"] });
export const aiPurposeRequestsTotal = new client.Counter({ name: "ai_purpose_requests_total", help: "AI requests by stable product purpose and prompt bundle", labelNames: ["provider", "model", "purpose", "promptVersion", "outcome"] });
export const adaptiveInterviewEventsTotal = new client.Counter({ name: "adaptive_interview_events_total", help: "Adaptive interviewer state transitions", labelNames: ["event", "action"] });
export const adaptiveDifficultyTransitionsTotal = new client.Counter({ name: "adaptive_difficulty_transitions_total", help: "Adaptive interviewer difficulty changes", labelNames: ["from", "to"] });
export const adaptiveFallbackQuestionsTotal = new client.Counter({ name: "adaptive_fallback_questions_total", help: "Adaptive questions served from deterministic or grounded fallback paths" });
// How often deterministic guards had to correct AI-generated questions. A rising rate means a prompt or
// model regression (invented candidate facts, repeated probes, wrong question format).
export const aiQuestionGuardEventsTotal = new client.Counter({ name: "ai_question_guard_events_total", help: "AI question guard interventions", labelNames: ["stage", "guard", "outcome"] });
export const adaptiveFollowUpsTotal = new client.Counter({ name: "adaptive_followups_total", help: "Follow-up probes asked inside adaptive Practice rounds" });
export const adaptiveRoundQuestions = new client.Histogram({ name: "adaptive_round_questions", help: "Completed base-question count for adaptive Practice rounds", buckets: [1, 2, 3, 4, 5, 6, 8, 10] });
export const adaptiveRoundCoverage = new client.Histogram({ name: "adaptive_round_coverage_percent", help: "Final weighted competency coverage for adaptive Practice rounds", buckets: [25, 40, 55, 70, 80, 90, 95, 100] });
export const reminderDeliveriesTotal = new client.Counter({ name: "reminder_deliveries_total", help: "Reminder delivery outcomes", labelNames: ["outcome"] });
export const reminderDeliveryDurationSeconds = new client.Histogram({ name: "reminder_delivery_duration_seconds", help: "Reminder email delivery duration", labelNames: ["outcome"], buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30] });
export const reminderDeliveryLagSeconds = new client.Histogram({ name: "reminder_delivery_lag_seconds", help: "Delay between scheduled and delivered reminder", buckets: [1, 30, 60, 300, 900, 3600, 21600, 86400] });
export const reminderRetriesTotal = new client.Counter({ name: "reminder_retries_total", help: "Reminder retries scheduled" });
export const billingCheckoutTotal = new client.Counter({ name: "billing_checkout_total", help: "Checkout-session creation outcomes", labelNames: ["outcome"] });
export const productEventsTotal = new client.Counter({ name: "product_events_total", help: "Allowlisted product funnel events", labelNames: ["event", "plan"] });
export const interviewGroundingTotal = new client.Counter({ name: "interview_grounding_total", help: "Company interview grounding outcomes", labelNames: ["outcome"] });
export const interviewGroundingDurationSeconds = new client.Histogram({ name: "interview_grounding_duration_seconds", help: "Company interview grounding search duration", labelNames: ["outcome"], buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30] });
export const interviewGroundingSources = new client.Histogram({ name: "interview_grounding_sources", help: "Public sources retained per grounding search", buckets: [0, 1, 2, 3, 5, 8] });
export const assessmentsTotal = new client.Counter({ name: "assessments_total", help: "Assessment lifecycle outcomes", labelNames: ["action", "outcome"] });
export const assessmentQuestions = new client.Histogram({ name: "assessment_questions", help: "Questions generated per assessment", buckets: [1, 3, 5, 8, 10, 15, 25, 50] });
export const candidateAssessmentActionsTotal = new client.Counter({ name: "candidate_assessment_actions_total", help: "Candidate assessment funnel actions", labelNames: ["action", "outcome", "followups"] });
export const candidateAssessmentCompletionDurationSeconds = new client.Histogram({ name: "candidate_assessment_completion_duration_seconds", help: "Elapsed time from candidate attempt start to submission", buckets: [60, 300, 600, 1200, 1800, 3600, 7200, 14400] });
export const assessmentReportsViewedTotal = new client.Counter({ name: "assessment_reports_viewed_total", help: "Private assessment reports viewed by an owner", labelNames: ["has_submissions"] });

export default {
    client,
    httpRequestsTotal,
    httpRequestDurationSeconds,
    httpRequestsInFlight,
    httpResponseSizeBytes,
    httpRequestTimeoutsTotal,
    rateLimitHitsTotal,
    csrfDeniedTotal,
    originDeniedTotal,
    errorsTotal,
    authLoginAttemptsTotal,
    authRegisterTotal,
    authVerifyTotal,
    authResetTotal,
    authLogoutTotal,
    securityPasswordChangeTotal,
    uploadResumeTotal,
    sttTranscribeTotal,
    runCodeTotal,
    codeRunnerRuntimeAvailable,
    quotasDeniedTotal,
    tokensRotatedTotal,
    sessionsRevokedTotal,
    authorizationDeniedTotal,
    componentReady,
    dependencyOperationDurationSeconds,
    queueJobsTotal,
    queueJobDurationSeconds,
    queueDepth,
    queueRetriesTotal,
    aiRequestsTotal,
    aiRequestDurationSeconds,
    aiTokensTotal,
    aiFallbacksTotal,
    aiInvalidResponsesTotal,
    aiPurposeRequestsTotal,
    adaptiveInterviewEventsTotal,
    adaptiveDifficultyTransitionsTotal,
    adaptiveFallbackQuestionsTotal,
    adaptiveFollowUpsTotal,
    aiQuestionGuardEventsTotal,
    adaptiveRoundQuestions,
    adaptiveRoundCoverage,
    reminderDeliveriesTotal,
    reminderDeliveryDurationSeconds,
    reminderDeliveryLagSeconds,
    reminderRetriesTotal,
    billingCheckoutTotal,
    productEventsTotal,
    interviewGroundingTotal,
    interviewGroundingDurationSeconds,
    interviewGroundingSources,
    assessmentsTotal,
    assessmentQuestions,
    candidateAssessmentActionsTotal,
    candidateAssessmentCompletionDurationSeconds,
    assessmentReportsViewedTotal,
};

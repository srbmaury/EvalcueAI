# EvalcueAI observability

The server exports Prometheus metrics at `/metrics` and pushes OTLP metrics when the Grafana environment variables are configured. Route labels use Express route templates and never user IDs, candidate IDs, attempt IDs, assessment IDs, or job IDs. New `prom-client` metrics registered in the default registry are automatically included in the existing OTLP push path.

## Recommended dashboard panels

| Panel | PromQL |
| --- | --- |
| Request rate | `sum(rate(http_requests_total[5m])) by (route)` |
| 5xx rate | `sum(rate(http_requests_total{status=~"5.."}[5m])) or vector(0)` |
| p95 latency | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))` |
| In-flight requests | `sum(http_requests_in_flight) by (method)` |
| Component readiness | `min(component_ready) by (component)` |
| Mongo checked-out connections | `mongo_pool_connections{state="checked_out"}` |
| Mongo pool wait queue | `mongo_pool_wait_queue` |
| Mongo checkout failures | `increase(mongo_pool_checkout_failures_total[15m]) or vector(0)` |
| Redis readiness | `redis_connection_ready` |
| Redis p95 ping latency | `histogram_quantile(0.95, sum(rate(redis_ping_duration_seconds_bucket{outcome="success"}[10m])) by (le))` |
| Redis reconnects | `increase(redis_reconnects_total[1h]) or vector(0)` |
| AI p95 latency | `histogram_quantile(0.95, sum(rate(ai_request_duration_seconds_bucket[10m])) by (le, provider))` |
| AI tokens | `sum(increase(ai_tokens_total[24h])) by (provider, model, type)` |
| AI tokens by purpose | `sum(increase(ai_tokens_by_purpose_total[24h])) by (provider, model, purpose, type)` |
| Queue depth | `sum(queue_depth{state=~"waiting|active|delayed"}) by (queue, state)` |
| Queue oldest waiting job | `max(queue_oldest_waiting_job_age_seconds) by (queue)` |
| Queue p95 wait | `histogram_quantile(0.95, sum(rate(queue_wait_duration_seconds_bucket[10m])) by (le, queue))` |
| Queue jobs in flight | `sum(queue_jobs_in_flight) by (queue)` |
| Queue failures | `sum(increase(queue_jobs_total{outcome=~"failed_retryable|dead_letter"}[1h])) by (queue, outcome) or vector(0)` |
| Hire evaluation p50/p95 | `histogram_quantile(0.50, sum(rate(assessment_evaluation_duration_seconds_bucket{outcome="success"}[1h])) by (le))` and `histogram_quantile(0.95, sum(rate(assessment_evaluation_duration_seconds_bucket{outcome="success"}[1h])) by (le))` |
| Hire evaluations in flight | `assessment_evaluations_in_flight` |
| Reminder delivery | `sum(increase(reminder_deliveries_total[24h])) by (outcome) or vector(0)` |
| Reminder p95 lag | `histogram_quantile(0.95, sum(rate(reminder_delivery_lag_seconds_bucket[24h])) by (le))` |
| Stripe webhooks | `sum(increase(billing_webhooks_total[24h])) by (event, outcome) or vector(0)` |
| Funnel | `sum(increase(product_events_total[7d])) by (event, plan) or vector(0)` |
| Interview grounding | `sum(increase(interview_grounding_total[24h])) by (outcome) or vector(0)` |
| Grounding p95 latency | `histogram_quantile(0.95, sum(rate(interview_grounding_duration_seconds_bucket[1h])) by (le))` |
| Authorization denials | `sum(increase(authorization_denied_total[1h])) by (reason, route) or vector(0)` |
| Assessments created | `sum(increase(assessments_total{action="create"}[24h])) by (outcome) or vector(0)` |
| Assessment size | `histogram_quantile(0.50, sum(rate(assessment_questions_bucket[24h])) by (le))` |
| Candidate assessment funnel | `sum(increase(candidate_assessment_actions_total[24h])) by (action, outcome, followups) or vector(0)` |
| Candidate completion p50/p95 | `histogram_quantile(0.50, sum(rate(candidate_assessment_completion_duration_seconds_bucket[24h])) by (le))` and `histogram_quantile(0.95, sum(rate(candidate_assessment_completion_duration_seconds_bucket[24h])) by (le))` |
| Reports viewed | `sum(increase(assessment_reports_viewed_total[24h])) by (has_submissions) or vector(0)` |
| Quota denials | `sum(increase(quotas_denied_total[1h])) by (actionKey) or vector(0)` |

Replace the obsolete CSRF panel with authorization denials; the application uses bearer tokens plus origin checks rather than cookie CSRF middleware.

## Recommended dashboard groups

Keep the launch setup small and operationally useful:

1. **API / infrastructure** — request RED metrics, process CPU/memory/default Node metrics, Mongo pool pressure, Redis readiness/latency, dependency readiness.
2. **Workers / queues** — depth, oldest waiting job, queue wait p95, processing duration, in-flight jobs, retries/dead letters, end-to-end Hire evaluation latency.
3. **AI / cost** — requests, latency, failures, fallbacks, invalid responses, tokens by provider/model/purpose.
4. **EvalcueAI Hire** — assessments, candidate funnel, completion duration, evaluation success, reports viewed.
5. **Adaptive / calibration** — question count, coverage, adaptive transitions, fallback rate, calibration agreement and disagreement signals.

## Recommended alerts

- Component down: `component_ready == 0` for 5 minutes.
- Elevated 5xx: server errors exceed 2% of requests for 10 minutes, with at least 20 requests.
- API latency: global p95 exceeds 2 seconds for 10 minutes.
- Mongo pool pressure: `mongo_pool_wait_queue > 0` for 5 minutes or any sustained increase in checkout failures.
- Redis unavailable: `redis_connection_ready == 0` for 2 minutes.
- Redis instability: reconnect count increases repeatedly over 15 minutes.
- Queue stalled: waiting plus delayed depth exceeds 25 for 10 minutes.
- Queue lag: oldest waiting job exceeds 120 seconds for 5 minutes.
- Hire evaluation latency: p95 successful evaluation duration exceeds 5 minutes for 10 minutes after at least 5 completed evaluations.
- Dead-letter job: any increase in `queue_jobs_total{outcome="dead_letter"}` over 15 minutes.
- Reminder failure: failure ratio exceeds 10% over 1 hour, with at least 5 attempts.
- Billing failure: any processing failure for a Stripe webhook over 10 minutes.
- AI degradation: failure ratio exceeds 20% over 15 minutes, with at least 10 requests.
- Authentication spike: invalid or blocked login attempts exceed 30 over 10 minutes.
- Candidate funnel degradation: assessment start or submit failures exceed 10% over 30 minutes, with at least 10 actions.
- Assessment abuse pressure: any sustained increase in `quotas_denied_total{actionKey=~"assessment_.*"}` for 15 minutes.
- Code runner down: `component_ready{component="code_runner"} == 0` for 5 minutes while `ENABLE_CODE_EXEC=true` (the API keeps serving, but Run and debugging rounds fail).
- Code runner lost a runtime: `code_runner_runtime_available == 0` for any runtime for 10 minutes.
- Code runner saturated: any increase in `runner_queue_rejected_total`, or `runner_queue_jobs{state="waiting"} > 10` for 5 minutes (scraped from the runner's `/metrics`).
- Code runner slow: p95 `runner_job_duration_seconds{kind="project"}` above 30 seconds for 15 minutes.

## Render process separation

Today the API and BullMQ workers can run in the same process. When they are split into separate Render services, run the same OTLP exporter in both processes and use distinct service names, for example:

```text
evalcue-api
evalcue-worker
```

The worker process must push its own metrics because worker CPU/memory and worker-local queue processing metrics are not visible from the API process. Keep queue names, product purposes, provider/model names, and terminal outcomes as bounded labels; keep entity identifiers in logs/traces rather than Prometheus labels.

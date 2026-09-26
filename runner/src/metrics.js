// Prometheus text exposition without dependencies. Labels are bounded: job kind, runtime id and result status.
const BUCKETS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60];

const labels = (pairs) => `{${Object.entries(pairs).map(([key, value]) => `${key}="${value}"`).join(",")}}`;

export const createMetrics = () => {
    const jobs = new Map();
    const durations = new Map();
    let rejected = 0;

    return {
        observeJob: ({ kind, runtime, status, seconds }) => {
            const jobKey = JSON.stringify({ kind, runtime, status });
            jobs.set(jobKey, (jobs.get(jobKey) || 0) + 1);
            const durationKey = JSON.stringify({ kind, runtime });
            const entry = durations.get(durationKey) || { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
            BUCKETS.forEach((bound, index) => { if (seconds <= bound) entry.buckets[index] += 1; });
            entry.sum += seconds;
            entry.count += 1;
            durations.set(durationKey, entry);
        },
        observeRejected: () => { rejected += 1; },
        render: ({ queue, runtimeIds, available }) => {
            const lines = [
                "# HELP runner_jobs_total Jobs finished, by kind (snippet|project), runtime and result status.",
                "# TYPE runner_jobs_total counter",
                ...[...jobs].map(([key, count]) => `runner_jobs_total${labels(JSON.parse(key))} ${count}`),
                "# HELP runner_job_duration_seconds Job duration from request to result, including time waiting in the queue.",
                "# TYPE runner_job_duration_seconds histogram",
            ];
            for (const [key, entry] of durations) {
                const base = JSON.parse(key);
                BUCKETS.forEach((bound, index) => lines.push(`runner_job_duration_seconds_bucket${labels({ ...base, le: bound })} ${entry.buckets[index]}`));
                lines.push(`runner_job_duration_seconds_bucket${labels({ ...base, le: "+Inf" })} ${entry.count}`);
                lines.push(`runner_job_duration_seconds_sum${labels(base)} ${entry.sum}`);
                lines.push(`runner_job_duration_seconds_count${labels(base)} ${entry.count}`);
            }
            lines.push(
                "# HELP runner_queue_jobs Jobs currently running or waiting.",
                "# TYPE runner_queue_jobs gauge",
                `runner_queue_jobs{state="active"} ${queue.active}`,
                `runner_queue_jobs{state="waiting"} ${queue.waiting}`,
                "# HELP runner_queue_rejected_total Requests rejected because the waiting line was full.",
                "# TYPE runner_queue_rejected_total counter",
                `runner_queue_rejected_total ${rejected}`,
                "# HELP runner_runtime_available Whether a runtime passed its startup probe inside the sandbox.",
                "# TYPE runner_runtime_available gauge",
                ...runtimeIds.map((id) => `runner_runtime_available{runtime="${id}"} ${available.includes(id) ? 1 : 0}`),
            );
            return `${lines.join("\n")}\n`;
        },
    };
};

// Runs at most `concurrency` jobs at once; up to `limit` more wait in line, beyond that callers are told to retry.
export const createQueue = ({ concurrency, limit }) => {
    let active = 0;
    const waiting = [];

    const next = () => {
        if (active >= concurrency || !waiting.length) return;
        const { task, resolve, reject } = waiting.shift();
        active += 1;
        Promise.resolve().then(task).then(resolve, reject).finally(() => { active -= 1; next(); });
    };

    return {
        push: (task) => {
            if (waiting.length >= limit) return Promise.reject(Object.assign(new Error("Runner is busy, try again shortly"), { statusCode: 429 }));
            return new Promise((resolve, reject) => { waiting.push({ task, resolve, reject }); next(); });
        },
        stats: () => ({ active, waiting: waiting.length }),
    };
};

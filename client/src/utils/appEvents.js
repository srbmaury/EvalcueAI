export const PRACTICE_LIMIT_EVENT = "evalcue:practice-limit";

let lastPracticeLimitAt = 0;

export const markPracticeLimitHandled = () => {
    lastPracticeLimitAt = Date.now();
};

export const practiceLimitHandledRecently = (windowMs = 1000) => (
    lastPracticeLimitAt > 0 && Date.now() - lastPracticeLimitAt < windowMs
);

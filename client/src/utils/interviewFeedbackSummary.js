const numericScore = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const score = Number(value);
    return Number.isFinite(score) ? score : null;
};

const roundSummary = (round) => {
    const questions = Array.isArray(round?.questions) ? round.questions : [];
    const scores = questions.map((item) => numericScore(item?.feedback?.score)).filter((score) => score !== null);
    const score = scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10 : null;
    return {
        id: round?._id,
        name: round?.name || "Round",
        status: round?.status,
        score,
        scoredQuestionCount: scores.length,
        questions,
    };
};

export const buildInterviewFeedbackSummary = (interview) => {
    const rounds = (Array.isArray(interview?.rounds) ? interview.rounds : [])
        .map((entry) => roundSummary(entry?.round || entry))
        .filter((round) => round.status === "completed" || round.scoredQuestionCount > 0);
    const scoredRounds = rounds.filter((round) => round.score !== null).sort((a, b) => b.score - a.score);
    const scoredQuestionCount = rounds.reduce((sum, round) => sum + round.scoredQuestionCount, 0);
    const allScores = rounds.flatMap((round) => round.questions)
        .map((item) => numericScore(item?.feedback?.score))
        .filter((score) => score !== null);
    const providedOverall = numericScore(interview?.overallScore);
    const overallScore = providedOverall ?? (allScores.length
        ? Math.round((allScores.reduce((sum, value) => sum + value, 0) / allScores.length) * 10) / 10
        : null);

    const seenSuggestions = new Set();
    const topSuggestions = [];
    [...rounds]
        .sort((a, b) => (a.score ?? Number.POSITIVE_INFINITY) - (b.score ?? Number.POSITIVE_INFINITY))
        .forEach((round) => {
            round.questions.forEach((item) => {
                (Array.isArray(item?.feedback?.suggestions) ? item.feedback.suggestions : []).forEach((suggestion) => {
                    const value = String(suggestion || "").trim();
                    const key = value.toLocaleLowerCase();
                    if (value && !seenSuggestions.has(key) && topSuggestions.length < 5) {
                        seenSuggestions.add(key);
                        topSuggestions.push(value);
                    }
                });
            });
        });

    const feedbackPending = rounds.some((round) => round.questions.some((item) => {
        const answered = Boolean(String(item?.answerGiven || "").trim())
            || (Array.isArray(item?.discussionTurns) && item.discussionTurns.some((turn) => turn?.speaker === "candidate" && String(turn?.text || "").trim()))
            || (Array.isArray(item?.followUps) && item.followUps.some((followUp) => String(followUp?.answer || "").trim()));
        return answered && !item?.feedback;
    }));

    return {
        overallScore,
        scoredQuestionCount,
        strongestRound: scoredRounds[0] || null,
        focusRound: scoredRounds.length ? scoredRounds[scoredRounds.length - 1] : null,
        topSuggestions,
        feedbackPending,
        rounds,
    };
};

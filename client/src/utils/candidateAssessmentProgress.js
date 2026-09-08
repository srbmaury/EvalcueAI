export const pendingFollowUpFor = (round, question) => {
    if (!question || round?.deliveryMode === "system-design") return null;
    if (Number(question.followUpNumber || 0) > 0 && question.followUpQuestion) {
        return { question: question.followUpQuestion, number: Number(question.followUpNumber || 1) };
    }
    if (question.followUpQuestion && !question.followUpAnswer) return { question: question.followUpQuestion, number: 1 };
    return null;
};

export const roundComplete = (round) => {
    if (!round) return false;
    if (round.deliveryMode === "system-design") return Boolean(round.questions?.[0]?.answer?.trim());
    if (round.adaptive && !round.adaptiveComplete) return false;
    const questions = round.questions || [];
    return questions.length > 0 && questions.every((question) => Boolean(question.answer?.trim()) && !pendingFollowUpFor(round, question));
};

export const firstIncompleteQuestionIndex = (round) => {
    if (!round || round.deliveryMode === "system-design") return -1;
    return (round.questions || []).findIndex((question) => !question.answer?.trim() || Boolean(pendingFollowUpFor(round, question)));
};

export const completedQuestionCount = (round) => (round?.questions || []).filter(
    (question) => Boolean(question.answer?.trim()) && !pendingFollowUpFor(round, question),
).length;

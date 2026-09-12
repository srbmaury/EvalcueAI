export const pendingFollowUpFor = (round, question) => {
    if (!question || ["system-design", "debugging"].includes(round?.deliveryMode)) return null;
    if (Number(question.followUpNumber || 0) > 0 && question.followUpQuestion) {
        return { question: question.followUpQuestion, number: Number(question.followUpNumber || 1) };
    }
    if (question.followUpQuestion && !question.followUpAnswer) return { question: question.followUpQuestion, number: 1 };
    return null;
};

export const roundComplete = (round) => {
    if (!round) return false;
    if (["system-design", "debugging"].includes(round.deliveryMode)) return Boolean(round.questions?.[0]?.answer?.trim());
    if (round.adaptive && !round.adaptiveComplete) return false;
    const questions = round.questions || [];
    return questions.length > 0 && questions.every((question) => Boolean(question.answer?.trim()) && !pendingFollowUpFor(round, question));
};

export const firstIncompleteQuestionIndex = (round) => {
    if (!round || ["system-design", "debugging"].includes(round.deliveryMode)) return -1;
    return (round.questions || []).findIndex((question) => !question.answer?.trim() || Boolean(pendingFollowUpFor(round, question)));
};

export const completedQuestionCount = (round) => (round?.questions || []).filter(
    (question) => Boolean(question.answer?.trim()) && !pendingFollowUpFor(round, question),
).length;

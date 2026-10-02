// A question's AI follow-ups live in `followUps`; the current one is the newest unanswered entry, else the newest.
export const followUpList = (item) => Array.isArray(item?.followUps) ? item.followUps : [];

export const pendingFollowUpFor = (item) => [...followUpList(item)].reverse().find((followUp) => followUp?.question && !followUp?.answer) || null;

export const hasPendingFollowUp = (item) => Boolean(pendingFollowUpFor(item));

// The candidate client renders the current follow-up through these two fields.
export const currentFollowUpFields = (item) => {
    const pending = pendingFollowUpFor(item);
    const current = pending || followUpList(item).at(-1);
    return { followUpQuestion: current?.question || "", followUpAnswer: pending ? "" : current?.answer || "" };
};

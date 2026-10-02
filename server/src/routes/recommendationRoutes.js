import express from "express";
import protect from "../middleware/authMiddleware.js";
import Interview from "../models/Interview.js";

const router = express.Router();
const goalCopy = {
    "get-first-role": ["Build a strong introduction", "Practice behavioral foundations", "Run one role-specific mock"],
    "switch-role": ["Translate transferable experience", "Close role-specific knowledge gaps", "Practice your transition story"],
    promotion: ["Demonstrate scope and leadership", "Practice strategic tradeoffs", "Quantify team-level impact"],
    confidence: ["Start with a short recruiter screen", "Retry your weakest answer", "Build consistency with weekly practice"],
    other: ["Define the outcome you want", "Run a focused mock interview", "Review and retry one answer"],
};

router.get("/", protect, async (req, res, next) => {
    try {
        const recent = await Interview.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(1).populate({ path: "rounds.round", select: "status" }).lean();
        const last = recent[0];
        const hasIncomplete = Boolean(last?.rounds?.some((entry) => entry.round?.status !== "completed"));
        const actions = (goalCopy[req.user.practiceGoal] || goalCopy.confidence).map((title, index) => ({
            id: `${req.user.practiceGoal || "confidence"}-${index}`,
            title,
            href: index === 1 && hasIncomplete ? `/practice/interviews/${last._id}` : index === 2 ? "/practice/progress" : "/practice/new",
            reason: index === 1 && hasIncomplete ? "Continue your latest unfinished session while the context is fresh." : index === 2 ? `Your weekly plan prepares ${req.user.weeklyPracticeTarget || 3} tailored practice session${(req.user.weeklyPracticeTarget || 3) === 1 ? "" : "s"}.` : req.user.targetRole ? `Create focused practice for your ${req.user.targetRole} target.` : "Set a target role through a focused practice session.",
        }));
        res.json({ goal: req.user.practiceGoal || "confidence", targetRole: req.user.targetRole || "", weeklyTarget: req.user.weeklyPracticeTarget || 3, hasIncomplete, actions });
    } catch (error) { next(error); }
});
export default router;

// Lightweight Tavily search for interview experiences
const getFetch = async () => {
    if (typeof fetch !== "undefined") return fetch;
    const { default: nodeFetch } = await import("node-fetch");
    return nodeFetch;
};
import SavedExperience from "../models/SavedExperience.js";
import { cleanSourceSnippet } from "../utils/sourceSnippet.js";

export const searchExperiences = async (req, res, next) => {
    try {
        const company = (req.query.company || "").toString().trim().slice(0, 120);
        const role = (req.query.role || "").toString().trim().slice(0, 120);
        if (!company || !role) return res.status(400).json({ message: "company and role are required" });
        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) return res.json({ results: [] });
        const f = await getFetch();
        const query = `${company} ${role} interview experience`;
        const body = { api_key: apiKey, query, search_depth: "advanced", include_answer: true, max_results: 8 };
        const resp = await f("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!resp.ok) return res.json({ results: [] });
        const json = await resp.json();
        const out = (Array.isArray(json?.results) ? json.results : []).map((r) => ({
            title: (r.title || "").toString().trim().slice(0, 200),
            url: (r.url || "").toString().trim(),
            snippet: cleanSourceSnippet(r.content, r.title, 400),
        }));
        return res.json({ results: out });
    } catch (e) {
        return res.json({ results: [] });
    }
};

export const getSavedExperiences = async (req, res, next) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 50);
        const query = { user: req.user._id };
        const [items, total] = await Promise.all([
            SavedExperience.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            SavedExperience.countDocuments(query),
        ]);
        return res.json({ items, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
    }
    catch (error) { return next(error instanceof Error ? error : new Error(String(error))); }
};

export const saveExperience = async (req, res, next) => {
    try {
        const payload = { ...req.body, user: req.user._id };
        const saved = await SavedExperience.findOneAndUpdate(
            { user: req.user._id, url: payload.url },
            { $set: payload },
            { new: true, upsert: true, runValidators: true }
        );
        return res.status(201).json(saved);
    } catch (error) { return next(error instanceof Error ? error : new Error(String(error))); }
};

export const deleteSavedExperience = async (req, res, next) => {
    try {
        const deleted = await SavedExperience.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!deleted) return res.status(404).json({ message: "Saved experience not found" });
        return res.json({ message: "Saved experience removed" });
    } catch (error) { return next(error instanceof Error ? error : new Error(String(error))); }
};

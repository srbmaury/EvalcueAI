import { runSnippet } from "../services/codeRunner.js";

const runCode = async (req, res) => {
    try {
        return res.json(await runSnippet(req.body || {}));
    } catch (error) {
        return res.status(error?.statusCode || 502).json({ error: error?.message || "Code execution failed" });
    }
};

export default runCode;

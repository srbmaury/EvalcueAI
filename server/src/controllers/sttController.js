import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { assertAudioMagic } from "../utils/magicBytes.js";
import metrics from "../metrics/index.js";
import { recordAiQualityEvent } from "../services/aiQuality.js";
import { looksGenerated, looksLikeSilencePhrase, looksPromptDerived } from "../utils/transcriptGuard.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// gpt-4o-mini-transcribe is markedly more accurate than whisper-1 on technical vocabulary and
// accented English. whisper-1 stays as an automatic fallback if the configured model is unavailable.
const PRIMARY_MODEL = process.env.STT_MODEL_NAME || "gpt-4o-mini-transcribe";
const FALLBACK_MODEL = "whisper-1";
const MAX_PROMPT_CHARS = 800;

// The prompt is a vocabulary hint (role, question, technical terms) that biases spelling of jargon.
// On non-speech audio the model can echo or answer it, so results are checked by transcriptGuard.
const cleanPrompt = (value) => (typeof value === "string" ? value : "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PROMPT_CHARS);

const cleanLanguage = (value) => (/^[a-z]{2}$/.test(String(value || "")) ? String(value) : "en");

const runTranscription = async (model, file, { prompt, language }) => openai.audio.transcriptions.create({
    model,
    file,
    response_format: "json",
    language,
    ...(prompt ? { prompt } : {}),
});

export const transcribe = async (req, res, next) => {
    try {
        const file = req.file;
        if (!file || !file.buffer) {
            return res.status(400).json({ message: "Missing audio file" });
        }
        // Validate magic bytes to ensure declared MIME matches real content
        try {
            assertAudioMagic(file.buffer, file.mimetype || "");
        } catch (e) {
            return res.status(400).json({ message: e?.message || "Invalid audio file" });
        }

        const options = { prompt: cleanPrompt(req.body?.prompt), language: cleanLanguage(req.body?.language) };
        const typed = () => toFile(file.buffer, file.originalname || "audio.webm", { type: file.mimetype || "audio/webm" });

        let resp;
        try {
            resp = await runTranscription(PRIMARY_MODEL, await typed(), options);
        } catch (primaryError) {
            if (PRIMARY_MODEL === FALLBACK_MODEL) throw primaryError;
            console.warn(`stt: ${PRIMARY_MODEL} failed, retrying with ${FALLBACK_MODEL}:`, primaryError?.message || primaryError);
            resp = await runTranscription(FALLBACK_MODEL, await typed(), options);
        }

        let text = (resp?.text || "").toString().trim();
        if (options.prompt && looksPromptDerived(text, options.prompt)) {
            // Likely an echo of the vocabulary hint or an answer to it rather than speech: transcribe again
            // without the hint, and drop anything that still reads as generated text.
            const retry = await runTranscription(PRIMARY_MODEL, await typed(), { ...options, prompt: "" }).catch(() => null);
            const retried = (retry?.text || "").toString().trim();
            text = looksGenerated(retried) ? "" : retried;
            recordAiQualityEvent("transcription", "prompt_echo", text ? "retried" : "dropped");
        }
        try { metrics.sttTranscribeTotal.labels("success").inc(); } catch {}
        if (text && looksLikeSilencePhrase(text)) {
            recordAiQualityEvent("transcription", "silence_phrase", "dropped");
            text = "";
        }
        return res.json({ text });
    } catch (error) {
        console.error("stt transcribe error:", error);
        try { metrics.sttTranscribeTotal.labels("failure").inc(); } catch {}
        return res.status(500).json({ message: "Transcription failed" });
    }
};

export default { transcribe };

// Shared toolkit for marketing screen recordings. These specs reuse the e2e mocking approach but
// are paced for humans: a visible cursor, caption cards, smooth mouse travel, and typing at a
// readable speed. Run with `npm run demo:record`; videos land in demo-recordings/<spec-title>.webm.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test as base } from "@playwright/test";

export const RECORDINGS_DIR = path.resolve(process.cwd(), "demo-recordings");

const PUBLIC_CONFIG = {
    google: { enabled: true, clientId: "demo-google-client.apps.googleusercontent.com" },
    captcha: { enabled: false, provider: "turnstile", loginEnabled: false, registerEnabled: false, candidateStartEnabled: false },
    features: { accountDataExport: false, codeExecution: true, transcription: true },
};

// Headless recordings have no OS cursor, so draw one that follows Playwright's synthetic mouse, plus
// a lower-third caption and a full-screen title card that specs drive through window.__demo.
const overlayScript = () => {
    const install = () => {
        if (document.getElementById("__demo-cursor")) return;
        const style = document.createElement("style");
        style.textContent = `
            #__demo-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -3px 0 0 -3px; pointer-events: none;
                transition: transform .12s ease; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
            #__demo-cursor.down { transform: scale(.82); }
            .__demo-ripple { position: fixed; z-index: 2147483646; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
                border: 3px solid rgba(36,81,199,.75); pointer-events: none; animation: __demo-ripple .55s ease-out forwards; }
            @keyframes __demo-ripple { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }
            #__demo-caption { position: fixed; z-index: 2147483645; left: 50%; bottom: 104px; transform: translate(-50%, 20px); max-width: 920px;
                padding: 14px 26px; border-radius: 14px; background: rgba(12,14,20,.9); color: #fff; opacity: 0; pointer-events: none;
                font: 600 22px/1.35 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; text-align: center;
                box-shadow: 0 12px 40px rgba(0,0,0,.35); transition: opacity .35s ease, transform .35s ease; }
            #__demo-caption.show { opacity: 1; transform: translate(-50%, 0); }
            #__demo-caption small { display: block; margin-top: 4px; font-weight: 450; font-size: 16px; color: rgba(255,255,255,.72); }
            #__demo-card { position: fixed; inset: 0; z-index: 2147483644; display: grid; place-items: center; text-align: center; padding: 48px;
                background: radial-gradient(circle at 50% 30%, #1d2c5c, #0b0d12 70%); color: #fff; opacity: 0; pointer-events: none;
                font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; transition: opacity .45s ease; }
            #__demo-card.show { opacity: 1; }
            #__demo-card h1 { margin: 0; font-size: 58px; line-height: 1.08; letter-spacing: -.03em; font-weight: 850; max-width: 1050px; }
            #__demo-card p { margin: 20px auto 0; font-size: 24px; color: rgba(255,255,255,.75); max-width: 860px; line-height: 1.45; }
            #__demo-card .brand { margin-bottom: 26px; font-size: 18px; letter-spacing: .14em; text-transform: uppercase; color: #8fb0ff; font-weight: 800; }`;
        document.head.appendChild(style);

        const cursor = document.createElement("div");
        cursor.id = "__demo-cursor";
        cursor.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        cursor.style.left = "-40px";
        document.body.appendChild(cursor);
        const caption = document.createElement("div");
        caption.id = "__demo-caption";
        document.body.appendChild(caption);
        const card = document.createElement("div");
        card.id = "__demo-card";
        document.body.appendChild(card);

        const escape = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
        window.addEventListener("mousemove", (event) => { cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`; }, true);
        window.addEventListener("mousedown", (event) => {
            cursor.classList.add("down");
            const ripple = document.createElement("div");
            ripple.className = "__demo-ripple";
            ripple.style.left = `${event.clientX}px`;
            ripple.style.top = `${event.clientY}px`;
            document.body.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        }, true);
        window.addEventListener("mouseup", () => cursor.classList.remove("down"), true);

        window.__demo = {
            caption(text, sub = "") {
                caption.innerHTML = `${escape(text)}${sub ? `<small>${escape(sub)}</small>` : ""}`;
                caption.classList.add("show");
            },
            hideCaption() { caption.classList.remove("show"); },
            card(title, sub = "") {
                card.innerHTML = `<div><div class="brand">EvalcueAI</div><h1>${escape(title)}</h1>${sub ? `<p>${escape(sub)}</p>` : ""}</div>`;
                card.classList.add("show");
            },
            hideCard() { card.classList.remove("show"); },
        };
    };
    if (document.body) install();
    else document.addEventListener("DOMContentLoaded", install, { once: true });
};

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const test = base.extend({
    page: async ({ page }, provide, testInfo) => {
        await page.route("**/api/auth/public-config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PUBLIC_CONFIG) }));
        await page.addInitScript(overlayScript);
        resetCursor();
        resetVoice();
        await provide(page);
        // Save each recording under a stable, readable name instead of Playwright's hashed folder.
        const video = page.video();
        await page.close();
        if (video) {
            await mkdir(RECORDINGS_DIR, { recursive: true });
            await video.saveAs(path.join(RECORDINGS_DIR, `${slug(testInfo.title)}.webm`));
            // Narration cues for e2e-demo/addVoice.mjs, which mixes them into an .mp4.
            if (voice.cues.length) {
                await writeFile(path.join(RECORDINGS_DIR, `${slug(testInfo.title)}.voice.json`), JSON.stringify(voice.cues, null, 2));
            }
        }
    },
});

export { expect };

export const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

// Pacing. Every pause is explicit so the final cut needs little or no trimming.
export const beat = (page, ms = 900) => page.waitForTimeout(ms);

let cursor = { x: 720, y: 450 };
export const resetCursor = () => { cursor = { x: 720, y: 450 }; };

// Glide the cursor to the element's center, hover briefly, then click, like a person would.
export const glideTo = async (page, locator, { click = true, hover = 350 } = {}) => {
    // Center the target so it is never hidden behind the caption, which sits above the app's toasts.
    const needsScroll = await locator.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top < 90 || rect.bottom > window.innerHeight - 230;
    });
    if (needsScroll) {
        await locator.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
        await page.waitForTimeout(700);
    }
    // A trial click waits until the element is visible and stable, so menus and popovers that
    // animate open are measured at their final position, not mid-transition.
    await locator.click({ trial: true });
    const box = await locator.boundingBox();
    if (!box) throw new Error("glideTo: element has no bounding box");
    const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const distance = Math.hypot(target.x - cursor.x, target.y - cursor.y);
    await page.mouse.move(target.x, target.y, { steps: Math.max(12, Math.min(45, Math.round(distance / 18))) });
    cursor = target;
    await page.waitForTimeout(hover);
    if (click) await page.mouse.click(target.x, target.y);
};

// Click into a field and type at a readable pace (default ~28 characters per second).
export const typeInto = async (page, locator, text, { delay = 35, clear = true } = {}) => {
    await glideTo(page, locator);
    if (clear) await locator.fill("");
    await locator.pressSequentially(text, { delay });
};

// DEMO_FRAMES=1 saves a still at every caption and title card, to review a take without scrubbing video.
let frame = 0;
const snapshot = async (page) => {
    if (!process.env.DEMO_FRAMES) return;
    await page.waitForTimeout(450);
    const dir = path.join(RECORDINGS_DIR, "frames");
    await mkdir(dir, { recursive: true });
    frame += 1;
    await page.screenshot({ path: path.join(dir, `${String(frame).padStart(3, "0")}.png`) });
};

// Narration. Every caption and title card is also spoken with macOS `say` (DEMO_VOICE=0 turns it
// off). Each line is synthesized before it appears, and the shot holds until the line finishes, so
// the video is paced to the voice. Cue times are logged relative to the start of the recording.
const execFileAsync = promisify(execFile);
const VOICE_ENABLED = process.env.DEMO_VOICE !== "0";
const VOICE_NAME = process.env.DEMO_VOICE_NAME || "Samantha";
const VOICE_RATE = process.env.DEMO_VOICE_RATE || "178";
const VOICE_DIR = path.join(RECORDINGS_DIR, "voice");
const voice = { startedAt: Date.now(), busyUntil: 0, cues: [] };
const resetVoice = () => { voice.startedAt = Date.now(); voice.busyUntil = 0; voice.cues = []; };

// Make on-screen text sound natural when read aloud.
const speakable = (text) => String(text)
    .replace(/practice\.evalcueai\.com/gi, "practice dot eval cue A.I. dot com")
    .replace(/hiring\.evalcueai\.com/gi, "hiring dot eval cue A.I. dot com")
    .replace(/evalcueai\.com/gi, "eval cue A.I. dot com")
    .replace(/EvalcueAI/g, "Eval cue A.I.")
    .replace(/\s*\u00b7\s*/g, ", ")
    .replace(/\u2026/g, " ")
    .replace(/\u00d7/g, " times ")
    .replace(/[\u201c\u201d"]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const synthesize = async (text) => {
    const line = speakable(text);
    if (!VOICE_ENABLED || !line) return null;
    const hash = createHash("sha1").update(`${VOICE_NAME}|${VOICE_RATE}|${line}`).digest("hex").slice(0, 16);
    const file = path.join(VOICE_DIR, `${hash}.aiff`);
    await mkdir(VOICE_DIR, { recursive: true });
    try { await access(file); } catch { await execFileAsync("say", ["-v", VOICE_NAME, "-r", VOICE_RATE, "-o", file, line]); }
    const { stdout } = await execFileAsync("afinfo", [file]);
    const seconds = Number(/estimated duration: ([\d.]+)/.exec(stdout)?.[1] || 0);
    return { file, ms: Math.round(seconds * 1000) };
};

// Wait for the previous line to finish, then start this one exactly when its visual appears.
const waitForVoice = async (page) => {
    const remaining = voice.busyUntil - Date.now();
    if (remaining > 0) await page.waitForTimeout(remaining);
};
const startLine = (clip) => {
    if (!clip) return 0;
    voice.cues.push({ file: path.relative(RECORDINGS_DIR, clip.file), at: Date.now() - voice.startedAt, ms: clip.ms });
    voice.busyUntil = Date.now() + clip.ms + 250;
    return clip.ms;
};

// `say` overrides the narration when the on-screen text would read badly aloud (for example "3/3").
export const caption = async (page, text, sub = "", ms = 2600, say = null) => {
    const clip = await synthesize(say ?? [text, sub].filter(Boolean).join(". "));
    await waitForVoice(page);
    await page.evaluate(([t, s]) => window.__demo?.caption(t, s), [text, sub]);
    const spoken = startLine(clip);
    await snapshot(page);
    if (ms) await page.waitForTimeout(Math.max(ms, spoken + 400));
};
export const hideCaption = async (page, ms = 350) => {
    await waitForVoice(page);
    await page.evaluate(() => window.__demo?.hideCaption());
    await page.waitForTimeout(ms);
};

// Full-screen title card, for the opening hook and the closing call to action.
export const titleCard = async (page, title, sub = "", ms = 3200, say = null) => {
    const clip = await synthesize(say ?? [title, sub].filter(Boolean).join(" "));
    await waitForVoice(page);
    await page.evaluate(([t, s]) => window.__demo?.card(t, s), [title, sub]);
    const spoken = startLine(clip);
    await snapshot(page);
    await page.waitForTimeout(Math.max(ms, spoken + 700));
    await page.evaluate(() => window.__demo?.hideCard());
    await page.waitForTimeout(500);
};

// Smooth scroll by a distance in small wheel steps so the video reads as a steady pan.
export const smoothScroll = async (page, distance, { step = 60, pause = 22 } = {}) => {
    const direction = Math.sign(distance);
    for (let moved = 0; moved < Math.abs(distance); moved += step) {
        await page.mouse.wheel(0, direction * step);
        await page.waitForTimeout(pause);
    }
};

// Scroll until a heading (or any locator) sits near the top third of the viewport.
export const scrollToReveal = async (page, locator, offset = 180) => {
    const box = await locator.boundingBox();
    if (!box) return;
    await smoothScroll(page, box.y - offset);
    await page.waitForTimeout(300);
};

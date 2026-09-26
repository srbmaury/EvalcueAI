// Mixes the narration recorded by demoKit.js into each demo video and writes a web-ready .mp4.
// Usage: node e2e-demo/addVoice.mjs            (every recording with a .voice.json cue file)
//        node e2e-demo/addVoice.mjs debugging  (only recordings whose name contains "debugging")
// Optional: DEMO_MUSIC=/path/to/track.mp3 adds a quiet background bed under the voice.
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const run = promisify(execFile);
const dir = path.resolve(process.cwd(), "demo-recordings");
const filter = process.argv[2] || "";
const music = process.env.DEMO_MUSIC || "";

const cueFiles = (await readdir(dir)).filter((name) => name.endsWith(".voice.json") && name.includes(filter));
if (!cueFiles.length) {
    console.error(`No narration cues found in ${dir}. Record first: npm run demo:record`);
    process.exit(1);
}

for (const cueFile of cueFiles) {
    const name = cueFile.replace(/\.voice\.json$/, "");
    const cues = JSON.parse(await readFile(path.join(dir, cueFile), "utf8"));
    const inputs = ["-i", path.join(dir, `${name}.webm`)];
    const labels = [];
    const filters = cues.map((cue, index) => {
        inputs.push("-i", path.join(dir, cue.file));
        labels.push(`[v${index}]`);
        // adelay places the line at the moment its caption appeared in the recording.
        return `[${index + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.max(0, Math.round(cue.at))}:all=1[v${index}]`;
    });
    filters.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,volume=1.6[voice]`);
    let output = "[voice]";
    if (music) {
        inputs.push("-stream_loop", "-1", "-i", music);
        // Duck the music under the narration so the voice always stays clear.
        filters.push(`[${cues.length + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.12[bed]`);
        filters.push("[bed][voice]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[ducked]");
        filters.push("[ducked][voice]amix=inputs=2:normalize=0:dropout_transition=0[mix]");
        output = "[mix]";
    }
    filters.push(`${output}apad[aout]`);

    const outFile = path.join(dir, `${name}.mp4`);
    await run("ffmpeg", [
        "-y", "-loglevel", "error",
        ...inputs,
        "-filter_complex", filters.join(";"),
        "-map", "0:v", "-map", "[aout]", "-shortest",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        outFile,
    ], { maxBuffer: 1024 * 1024 * 16 });
    console.log(`✓ ${path.relative(process.cwd(), outFile)} (${cues.length} narration lines)`);
}

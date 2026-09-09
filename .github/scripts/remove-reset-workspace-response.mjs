import fs from "node:fs";

const path = "server/src/controllers/authController.js";
const source = fs.readFileSync(path, "utf8");
const next = source.replace(
  '        return res.json({ message: "Password has been reset", workspace: resetWorkspace });',
  '        return res.json({ message: "Password has been reset" });',
);
if (next === source) throw new Error("Expected reset-password response string was not found");
fs.writeFileSync(path, next);
fs.rmSync(".github/workflows/remove-reset-workspace-response.yml", { force: true });
fs.rmSync(".github/scripts/remove-reset-workspace-response.mjs", { force: true });

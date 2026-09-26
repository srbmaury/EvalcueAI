import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        setupFiles: ["./src/test/setupEnv.js"],
        // API journeys run against an in-memory MongoDB per file; under a full parallel run a multi-request
        // test can exceed Vitest's 5 s default without anything being wrong.
        testTimeout: 20000,
    },
});

import { describe, expect, it } from "vitest";
import { normalizeEnvironment } from "../../config/bootstrapEnv.js";

describe("optional feature flag defaults", () => {
    it("defaults route-controlled features to disabled", () => {
        const env = { NODE_ENV: "production" };
        normalizeEnvironment(env);
        expect(env.ENABLE_STT).toBe("false");
        expect(env.ENABLE_CODE_EXEC).toBe("false");
        expect(env.ACCOUNT_DATA_EXPORT_ENABLED).toBe("false");
    });
});

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("../api/axios", () => ({ default: { get } }));

import usePublicConfig, { loadPublicConfig } from "../hooks/usePublicConfig";

describe("public runtime config", () => {
    beforeEach(() => { get.mockReset(); });

    it("loads backend-owned browser-safe auth configuration", async () => {
        get.mockResolvedValue({ data: { google: { enabled: true, clientId: "runtime-client" }, captcha: { enabled: false }, features: {} } });
        const loaded = await loadPublicConfig();
        expect(loaded.google.clientId).toBe("runtime-client");
        expect(get).toHaveBeenCalledWith("/auth/public-config", { skipAuthRedirect: true });
    });

    it("exposes a usable hook value", async () => {
        get.mockResolvedValue({ data: { google: { enabled: false, clientId: "" }, captcha: { enabled: false }, features: {} } });
        const { result } = renderHook(() => usePublicConfig());
        await act(async () => { await Promise.resolve(); });
        expect(result.current).toHaveProperty("google");
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    sign: vi.fn(),
    randomBytes: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    create: vi.fn(),
    findOne: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
}));
vi.mock("jsonwebtoken", () => ({ default: { sign: mocks.sign } }));
vi.mock("crypto", () => ({ default: {
    randomBytes: mocks.randomBytes,
    createHash: (algorithm) => ({ update: (raw) => ({ digest: (encoding) => `${algorithm}:${encoding}:${raw}` }) }),
} }));
vi.mock("../../models/User.js", () => ({ default: { findByIdAndUpdate: mocks.findByIdAndUpdate } }));
vi.mock("../../models/RefreshToken.js", () => ({ default: {
    create: mocks.create,
    findOne: mocks.findOne,
    deleteOne: mocks.deleteOne,
    deleteMany: mocks.deleteMany,
} }));

import { bumpTokenVersion, hashOpaqueToken, issueRefreshToken, revokeAllRefreshTokens, revokeRefreshToken, signAccessToken, validateRefreshToken } from "../../utils/tokens.js";

describe("authentication tokens", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.JWT_SECRET = "test-secret";
        mocks.sign.mockReturnValue("signed-token");
        mocks.randomBytes.mockReturnValue({ toString: () => "raw-refresh-token" });
        mocks.create.mockResolvedValue({});
        mocks.deleteOne.mockResolvedValue({});
        mocks.deleteMany.mockResolvedValue({});
    });

    it("signs access tokens with an optional token version", () => {
        expect(signAccessToken("user-1", 4)).toBe("signed-token");
        expect(mocks.sign).toHaveBeenCalledWith({ id: "user-1", tokenVersion: 4 }, "test-secret", { expiresIn: "900s" });
        signAccessToken("user-2");
        expect(mocks.sign).toHaveBeenLastCalledWith({ id: "user-2" }, "test-secret", { expiresIn: "900s" });
    });

    it("hashes and stores a new refresh session", async () => {
        expect(hashOpaqueToken("opaque")).toBe("sha256:hex:opaque");
        const before = Date.now();
        const result = await issueRefreshToken("user-1", { userAgent: "Browser", ip: "203.0.113.5" });
        expect(result.raw).toBe("raw-refresh-token");
        expect(result.expiresAt.getTime()).toBeGreaterThan(before);
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
            user: "user-1",
            tokenHash: "sha256:hex:raw-refresh-token",
            userAgent: "Browser",
            ip: "203.0.113.5",
        }));
    });

    it("validates active refresh tokens and deletes expired ones", async () => {
        mocks.findOne.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ _id: "token-1", user: "user-1", expiresAt: new Date(Date.now() + 60_000) }) });
        await expect(validateRefreshToken("active")).resolves.toBe("user-1");

        mocks.findOne.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ _id: "token-2", user: "user-2", expiresAt: new Date(Date.now() - 60_000) }) });
        await expect(validateRefreshToken("expired")).resolves.toBeNull();
        expect(mocks.deleteOne).toHaveBeenCalledWith({ _id: "token-2" });

        mocks.findOne.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(null) });
        await expect(validateRefreshToken("missing")).resolves.toBeNull();
    });

    it("revokes one session, all sessions, and safely ignores an empty token", async () => {
        await revokeRefreshToken("");
        expect(mocks.deleteOne).not.toHaveBeenCalled();
        await revokeRefreshToken("raw");
        expect(mocks.deleteOne).toHaveBeenCalledWith({ tokenHash: "sha256:hex:raw" });
        await revokeAllRefreshTokens("user-1");
        expect(mocks.deleteMany).toHaveBeenCalledWith({ user: "user-1" });
    });

    it("increments token versions and tolerates cleanup failures", async () => {
        const lean = vi.fn().mockResolvedValue({});
        mocks.findByIdAndUpdate.mockReturnValueOnce({ lean });
        await bumpTokenVersion("user-1");
        expect(mocks.findByIdAndUpdate).toHaveBeenCalledWith("user-1", { $inc: { tokenVersion: 1 } });
        mocks.findByIdAndUpdate.mockImplementationOnce(() => { throw new Error("database unavailable"); });
        await expect(bumpTokenVersion("user-2")).resolves.toBeUndefined();
    });
});

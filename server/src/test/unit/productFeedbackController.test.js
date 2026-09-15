import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    uploadStream: vi.fn((opts, cb) => { cb(null, { secure_url: "https://cdn.example.com/feedback_photos/a.jpg", public_id: "feedback_photos/a" }); return {}; }),
    destroy: vi.fn(async () => {}),
    scan: vi.fn(async () => ({ clean: true })),
    create: vi.fn(async (doc) => ({ _id: "feedback1", ...doc })),
}));
vi.mock("streamifier", () => ({ default: { createReadStream: () => ({ pipe: vi.fn() }) } }));
vi.mock("../../config/cloudinaryConfig.js", () => ({ default: { uploader: { upload_stream: mocks.uploadStream, destroy: mocks.destroy } } }));
vi.mock("../../utils/avScan.js", () => ({ optionalAntivirusScan: mocks.scan }));
vi.mock("../../models/ProductFeedback.js", () => ({ default: { create: mocks.create } }));

const { createProductFeedback } = await import("../../controllers/productFeedbackController.js");

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });
const file = (name) => ({ buffer: Buffer.from(name), mimetype: "image/png", originalname: name });

beforeEach(() => { vi.clearAllMocks(); mocks.uploadStream.mockImplementation((opts, cb) => { cb(null, { secure_url: "https://cdn.example.com/feedback_photos/a.jpg", public_id: "feedback_photos/a" }); return {}; }); mocks.scan.mockResolvedValue({ clean: true }); mocks.create.mockImplementation(async (doc) => ({ _id: "feedback1", ...doc })); });

describe("createProductFeedback", () => {
    it("uploads each attached photo and stores the resulting urls on the feedback doc", async () => {
        const req = { body: { category: "idea", message: "Add dark mode" }, user: { _id: "user1" }, files: [file("a.png"), file("b.png")] };
        const res = response();
        await createProductFeedback(req, res, vi.fn());
        expect(mocks.uploadStream).toHaveBeenCalledTimes(2);
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
            category: "idea", message: "Add dark mode", user: "user1",
            photos: [
                { url: "https://cdn.example.com/feedback_photos/a.jpg", publicId: "feedback_photos/a" },
                { url: "https://cdn.example.com/feedback_photos/a.jpg", publicId: "feedback_photos/a" },
            ],
        }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("creates feedback with no photos when none are attached", async () => {
        const req = { body: { category: "idea", message: "Add dark mode" }, user: { _id: "user1" }, files: [] };
        const res = response();
        await createProductFeedback(req, res, vi.fn());
        expect(mocks.uploadStream).not.toHaveBeenCalled();
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ photos: [] }));
    });

    it("rejects the whole submission if any photo fails the antivirus scan, without creating feedback", async () => {
        mocks.scan.mockResolvedValueOnce({ clean: true }).mockResolvedValueOnce({ clean: false, reason: "infected" });
        const req = { body: { category: "problem", message: "Bug" }, user: { _id: "user1" }, files: [file("a.png"), file("b.png")] };
        const res = response();
        await createProductFeedback(req, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.uploadStream).not.toHaveBeenCalled();
    });

    it("cleans up already-uploaded photos on Cloudinary if a later upload or the DB save fails", async () => {
        mocks.create.mockRejectedValueOnce(new Error("db down"));
        const req = { body: { category: "problem", message: "Bug" }, user: { _id: "user1" }, files: [file("a.png")] };
        const res = response();
        const next = vi.fn();
        await createProductFeedback(req, res, next);
        expect(mocks.destroy).toHaveBeenCalledWith("feedback_photos/a", { resource_type: "image" });
        expect(next).toHaveBeenCalled();
    });
});

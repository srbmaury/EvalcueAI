import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { uploadFeedbackPhotosMulter } from "../../middleware/multerMemory.js";
import errorHandler from "../../middleware/errorHandler.js";

const app = express();
app.post("/upload", uploadFeedbackPhotosMulter.array("photos", 4), (req, res) => res.json({ count: req.files?.length || 0 }));
app.use(errorHandler);

const png = (size = 10) => Buffer.alloc(size, 1);

describe("uploadFeedbackPhotosMulter", () => {
    it("accepts up to 4 image files", async () => {
        const res = await request(app).post("/upload")
            .attach("photos", png(), { filename: "a.png", contentType: "image/png" })
            .attach("photos", png(), { filename: "b.jpg", contentType: "image/jpeg" });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ count: 2 });
    });

    it("rejects more than 4 files", async () => {
        let req = request(app).post("/upload");
        for (let i = 0; i < 5; i++) req = req.attach("photos", png(), { filename: `${i}.png`, contentType: "image/png" });
        const res = await req;
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/too many files/i);
    });

    it("rejects a non-image mimetype", async () => {
        const res = await request(app).post("/upload")
            .attach("photos", Buffer.from("not an image"), { filename: "a.txt", contentType: "text/plain" });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/unsupported file type/i);
    });

    it("rejects a file over the size limit", async () => {
        const res = await request(app).post("/upload")
            .attach("photos", png(6 * 1024 * 1024), { filename: "big.png", contentType: "image/png" });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/too large/i);
    });
});

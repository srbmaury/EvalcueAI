import api from "../api/axios";
import { resumeFileError } from "../utils/resumeFileValidation";

const getResumes = async (opts = {}) => {
        const params = new URLSearchParams();
        if (opts.sort) params.set("sort", opts.sort);
        if (opts.tag) params.set("tag", opts.tag);
        if (opts.q) params.set("q", opts.q);
        if (opts.page) params.set("page", opts.page);
        if (opts.limit) params.set("limit", opts.limit);
        const qs = params.toString();
        const { data } = await api.get(`/resumes${qs ? `?${qs}` : ""}`);
        const normalized = data && Array.isArray(data.items) ? data : { items: Array.isArray(data) ? data : [], total: 0, page: 1, limit: opts.limit || 10, totalPages: 1 };
        return opts.paginated ? normalized : normalized.items;
};

const uploadResume = async (file) => {
        const validationError = resumeFileError(file);
        if (validationError) throw new Error(validationError);

        const form = new FormData();
        form.append("resume", file);
        const { data } = await api.post(`/resumes`, form, {
            headers: { "Content-Type": "multipart/form-data" },
        });
        return data;
};

const deleteResume = async (id) => {
    await api.delete(`/resumes/${id}`);
    return true;
};

const updateResume = async (id, payload) => {
        const { data } = await api.put(`/resumes/${id}`, payload);
        return data;
};

const downloadResume = async (resume) => {
    if (!resume?._id) throw new Error("Resume is unavailable");
    const { data } = await api.get(`/resumes/${resume._id}/preview`, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(data);
    try {
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = resume.fileName || "resume.pdf";
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }
};

const resumeApi = Object.freeze({ getResumes, uploadResume, deleteResume, updateResume, downloadResume });

export const useResumes = () => resumeApi;

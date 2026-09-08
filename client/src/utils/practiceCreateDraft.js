import { storage } from "./interviewStorage";

export const PRACTICE_CREATE_DRAFT_KEY = "ia:create-interview";

export const readPracticeCreateDraft = () => storage.get(PRACTICE_CREATE_DRAFT_KEY) || {};

export const writePracticeCreateDraft = (draft) => storage.set(PRACTICE_CREATE_DRAFT_KEY, draft);

export const clearPracticeCreateDraft = () => storage.remove(PRACTICE_CREATE_DRAFT_KEY);

import { productHomePath } from "./productRoutes";

export const WORKSPACE_EVENT = "evalcue:workspace";

const GUEST_WORKSPACE_KEY = "evalcue:workspace:guest";
const USER_WORKSPACE_PREFIX = "evalcue:workspace:user:";
const VALID_WORKSPACES = new Set(["practice", "hiring"]);

const getStorage = () => {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
};

export const normalizeWorkspace = (workspace) => (
    VALID_WORKSPACES.has(workspace) ? workspace : null
);

export const workspaceKeyForUser = (userId) => (
    userId ? `${USER_WORKSPACE_PREFIX}${userId}` : GUEST_WORKSPACE_KEY
);

export const getWorkspacePreference = (userId) => {
    const storage = getStorage();
    if (!storage) return null;
    return normalizeWorkspace(storage.getItem(workspaceKeyForUser(userId)));
};

export const setWorkspacePreference = (workspace, userId) => {
    const normalized = normalizeWorkspace(workspace);
    const storage = getStorage();
    if (!normalized || !storage) return null;

    storage.setItem(workspaceKeyForUser(userId), normalized);

    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT, {
            detail: { workspace: normalized, userId: userId || null },
        }));
    }

    return normalized;
};

export const clearWorkspacePreference = (userId) => {
    getStorage()?.removeItem(workspaceKeyForUser(userId));
};

export const clearGuestWorkspacePreference = () => {
    clearWorkspacePreference();
};

export const adoptGuestWorkspacePreference = (userId) => {
    if (!userId) return null;

    const guestWorkspace = getWorkspacePreference();
    if (guestWorkspace) {
        setWorkspacePreference(guestWorkspace, userId);
        clearGuestWorkspacePreference();
        return guestWorkspace;
    }

    return getWorkspacePreference(userId);
};

export const getWorkspaceHome = (workspace) => productHomePath(workspace === "hiring" ? "hiring" : "practice");

// With no saved choice, a member of any hiring organization starts in Hire; everyone else in Practice.
export const defaultWorkspaceFor = (organizations) => (Array.isArray(organizations) && organizations.length ? "hiring" : "practice");

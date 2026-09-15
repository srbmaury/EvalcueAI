/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { setOrganizationId as setApiOrganizationId } from "../api/axios";
import { AuthContext } from "./AuthContext";
import { describeError } from "../utils/errorFormatter";

const defaultOrganizationContext = {
    organizations: [],
    activeOrganization: null,
    activeOrganizationId: null,
    currentRole: null,
    loading: false,
    error: "",
    selectOrganization: () => {},
    createOrganization: async () => null,
    refreshOrganizations: async () => [],
};

export const OrganizationContext = createContext(defaultOrganizationContext);

const preferenceKey = (userId) => `evalcue:organization:user:${userId}`;

const readPreferredOrganization = (userId) => {
    if (!userId) return null;
    try { return localStorage.getItem(preferenceKey(userId)); } catch { return null; }
};

const writePreferredOrganization = (userId, organizationId) => {
    if (!userId) return;
    try {
        if (organizationId) localStorage.setItem(preferenceKey(userId), organizationId);
        else localStorage.removeItem(preferenceKey(userId));
    } catch { /* storage is optional */ }
};

export const OrganizationProvider = ({ children }) => {
    const { user } = useContext(AuthContext);
    const [organizations, setOrganizations] = useState([]);
    const [activeOrganizationId, setActiveOrganizationId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const selectOrganization = useCallback((organizationId) => {
        const selected = organizationId || null;
        setActiveOrganizationId(selected);
        setApiOrganizationId(selected);
        writePreferredOrganization(user?._id, selected);
    }, [user?._id]);

    const refreshOrganizations = useCallback(async () => {
        if (!user?._id) {
            setOrganizations([]);
            selectOrganization(null);
            return [];
        }
        setLoading(true);
        setError("");
        try {
            setApiOrganizationId(null);
            const { data } = await api.get("/organizations");
            const items = Array.isArray(data?.organizations) ? data.organizations : [];
            setOrganizations(items);
            const preferred = readPreferredOrganization(user._id);
            const selected = items.find((item) => item._id === preferred)?._id || items[0]?._id || null;
            selectOrganization(selected);
            return items;
        } catch (err) {
            setOrganizations([]);
            selectOrganization(null);
            setError(describeError(err, "Could not load hiring organizations"));
            return [];
        } finally {
            setLoading(false);
        }
    }, [selectOrganization, user?._id]);

    useEffect(() => {
        refreshOrganizations();
    }, [refreshOrganizations]);

    const createOrganization = useCallback(async (name) => {
        const { data } = await api.post("/organizations", { name });
        const organization = data?.organization;
        if (!organization) throw new Error("Organization was not created");
        setOrganizations((current) => [...current.filter((item) => item._id !== organization._id), organization]);
        selectOrganization(organization._id);
        return organization;
    }, [selectOrganization]);

    const activeOrganization = useMemo(
        () => organizations.find((organization) => organization._id === activeOrganizationId) || null,
        [activeOrganizationId, organizations],
    );

    const value = useMemo(() => ({
        organizations,
        activeOrganization,
        activeOrganizationId,
        currentRole: activeOrganization?.role || null,
        loading,
        error,
        selectOrganization,
        createOrganization,
        refreshOrganizations,
    }), [organizations, activeOrganization, activeOrganizationId, loading, error, selectOrganization, createOrganization, refreshOrganizations]);

    return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
};

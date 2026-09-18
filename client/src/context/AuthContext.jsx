/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useEffect, useState } from "react";

import api, { clearAccessToken, setAccessToken, silentRefresh } from "../api/axios";
import { adoptGuestWorkspacePreference, clearWorkspacePreference } from "../utils/workspacePreference";

export const AuthContext = createContext({ user: null });

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = useCallback(async () => {
        try {
            const { data } = await api.get(`/auth/profile`);
            adoptGuestWorkspacePreference(data?._id);
            setUser(data);
            return data;
        } catch {
            setUser(null);
            return null;
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                await silentRefresh();
                await fetchProfile();
            } catch { setUser(null); }
            setLoading(false);
        };
        init();
    }, [fetchProfile]);

    const login = async (email, password, captchaToken) => {
        const payload = { email, password };
        if (captchaToken) payload.captchaToken = captchaToken;
        const { data } = await api.post(`/auth/login`, payload);
        if (data?.token) setAccessToken(data.token);
        const profile = await fetchProfile();
        if (!profile) {
            // fetchProfile() swallows its own errors (correct for the silent-refresh-on-load
            // path, where a visitor who isn't logged in shouldn't see an error) but that
            // means a successful login whose immediately-following profile fetch has a
            // transient failure would otherwise resolve with a null user and no error at
            // all — the caller would just navigate the user forward only for a route guard
            // to silently bounce them back to login with zero explanation of what happened.
            clearAccessToken();
            throw new Error("Signed in, but your profile couldn't be loaded. Please try again.");
        }
        return profile;
    };

    const register = async (name, email, password, captchaToken) => {
        const payload = { name, email, password, termsAccepted: true };
        if (captchaToken) payload.captchaToken = captchaToken;
        const { data } = await api.post(`/auth/register`, payload);
        return data;
    };

    const googleLogin = async (idToken, { termsAccepted = false } = {}) => {
        const { data } = await api.post(`/auth/google`, { idToken, termsAccepted });
        if (data?.token) setAccessToken(data.token);
        const profile = await fetchProfile();
        if (!profile) {
            clearAccessToken();
            throw new Error("Signed in, but your profile couldn't be loaded. Please try again.");
        }
        return profile;
    };

    const startSsoLogin = async (email) => {
        const { data } = await api.post(`/sso/start`, { email }, { skipAuthRedirect: true });
        return data;
    };

    const completeSsoLogin = useCallback(async (exchangeCode) => {
        const { data } = await api.post(`/sso/exchange`, { exchangeCode }, { skipAuthRedirect: true });
        if (data?.token) setAccessToken(data.token);
        const authenticatedUser = await fetchProfile();
        return { user: authenticatedUser, organizationId: data?.organizationId || null };
    }, [fetchProfile]);

    const resendVerification = async (email) => {
        const { data } = await api.post(`/auth/resend-verification`, { email });
        return data;
    };

    const forgotPassword = async (email, captchaToken, workspace) => {
        const payload = { email };
        if (captchaToken) payload.captchaToken = captchaToken;
        if (["practice", "hiring"].includes(workspace)) payload.workspace = workspace;
        const { data } = await api.post(`/auth/forgot-password`, payload);
        return data;
    };

    const resetPassword = async ({ token, email, newPassword, captchaToken, workspace }) => {
        const payload = { token, email, newPassword };
        if (captchaToken) payload.captchaToken = captchaToken;
        if (["practice", "hiring"].includes(workspace)) payload.workspace = workspace;
        const { data } = await api.post(`/auth/reset-password`, payload);
        return data;
    };

    const logout = async () => {
        try { await api.post(`/auth/logout`); } catch { /* ignore */ }
        clearAccessToken();
        setUser(null);
    };

    const updateProfile = async (updates) => {
        const { data } = await api.put(`/auth/profile`, updates);
        if (data?.token) setAccessToken(data.token);
        if (data?.user) setUser(data.user);
        return data;
    };

    const deleteAccount = async ({ confirmation, password }) => {
        const { data } = await api.delete(`/auth/profile`, { data: { confirmation, password } });
        clearWorkspacePreference(user?._id);
        clearAccessToken();
        setUser(null);
        return data;
    };

    return (
        <AuthContext.Provider
            value={{ user, loading, login, register, googleLogin, startSsoLogin, completeSsoLogin, resendVerification, forgotPassword, resetPassword, logout, updateProfile, deleteAccount }}
        >
            {children}
        </AuthContext.Provider>
    );
};

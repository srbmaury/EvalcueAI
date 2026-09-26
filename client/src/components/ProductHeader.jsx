import { lazy, Suspense, useContext, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import {
    AddRounded,
    AutoAwesomeRounded,
    CompareArrowsRounded,
    DarkMode,
    DescriptionOutlined,
    ExpandMoreRounded,
    FolderOutlined,
    HistoryRounded,
    LightMode,
    LogoutRounded,
    Menu as MenuIcon,
    NotificationsNoneRounded,
    PersonOutlineRounded,
    RateReviewOutlined,
    SchoolOutlined,
    SettingsOutlined,
    WorkOutlineRounded,
} from "@mui/icons-material";
import {
    AppBar,
    Avatar,
    Badge,
    Box,
    Button,
    Container,
    Divider,
    IconButton,
    ListItemText,
    Menu,
    MenuItem,
    Stack,
    Toolbar,
    Tooltip,
    Typography,
} from "@mui/material";
import { AuthContext } from "../context/AuthContext";
import { OrganizationContext } from "../context/OrganizationContext";
import { useThemeMode } from "../context/ThemeContext";
import { useNotifications } from "../context/NotificationContext";
import { hiringHomeForRole, hiringPermissionsFor } from "../utils/hiringPermissions";
import { productLoginPath, productRegisterPath } from "../utils/productRoutes";
import { setWorkspacePreference } from "../utils/workspacePreference";

const ProductFeedbackDialog = lazy(() => import("./ProductFeedbackDialog"));

const CONFIG = {
    practice: {
        workspace: "practice",
        label: "Practice",
        icon: SchoolOutlined,
        publicHome: "/practice",
        appHome: "/practice/dashboard",
    },
    hiring: {
        workspace: "hiring",
        label: "Hire",
        icon: WorkOutlineRounded,
        publicHome: "/hire",
        appHome: "/hire/assessments",
    },
};

const navButtonSx = (active) => ({
    px: 1.35,
    color: active ? "primary.main" : "text.secondary",
    bgcolor: active ? "action.selected" : "transparent",
    "&:hover": { bgcolor: "action.hover", color: "text.primary" },
});

export const isProductNavItemActive = (location, item) => {
    if (item.matchPrefix && location.pathname.startsWith(item.matchPrefix)) return true;
    if (location.pathname !== item.path) return false;
    return item.hash ? location.hash === item.hash : !location.hash;
};

const resumeNavGroup = {
    label: "Resume tools",
    icon: DescriptionOutlined,
    children: [
        { label: "Generate tailored resume", description: "Create a one-page resume rewritten for a job", path: "/practice/resume-generate", icon: AutoAwesomeRounded },
        { label: "Resume review", description: "Compare against a target role and get feedback", path: "/practice/resume-review", icon: RateReviewOutlined },
        { label: "Find best match", description: "See which saved resume fits a job best", path: "/practice/resume-match", icon: CompareArrowsRounded },
        { label: "Resume library", description: "Manage and organize your saved resumes", path: "/practice/resumes", icon: FolderOutlined },
        { label: "Past reviews", description: "Revisit feedback from earlier reviews", path: "/practice/resume-reviews", icon: HistoryRounded },
    ],
};

export default function ProductHeader({ surface = "practice" }) {
    const config = CONFIG[surface] || CONFIG.practice;
    const ProductIcon = config.icon;
    const { user, loading, logout } = useContext(AuthContext);
    const organizationContext = useContext(OrganizationContext);
    const organizations = organizationContext?.organizations || [];
    const activeOrganization = organizationContext?.activeOrganization || null;
    const selectOrganization = organizationContext?.selectOrganization || (() => {});
    const currentRole = organizationContext?.currentRole || null;
    const permissions = hiringPermissionsFor(currentRole);
    const { mode, toggle } = useThemeMode();
    const { notifications, unreadCount, markNotificationRead, markAllRead } = useNotifications();
    const location = useLocation();
    const navigate = useNavigate();
    const [mobileAnchor, setMobileAnchor] = useState(null);
    const [profileAnchor, setProfileAnchor] = useState(null);
    const [navGroupAnchor, setNavGroupAnchor] = useState(null);
    const [organizationAnchor, setOrganizationAnchor] = useState(null);
    const [notificationAnchor, setNotificationAnchor] = useState(null);
    const [feedbackOpen, setFeedbackOpen] = useState(false);

    useEffect(() => {
        if (user?._id) setWorkspacePreference(config.workspace, user._id);
        else setWorkspacePreference(config.workspace);
    }, [config.workspace, user?._id]);

    useEffect(() => {
        setMobileAnchor(null);
        setProfileAnchor(null);
        setOrganizationAnchor(null);
        setNotificationAnchor(null);
        setNavGroupAnchor(null);
    }, [location.pathname, location.search, location.hash]);

    const hasHiringOrganization = Boolean(activeOrganization?._id);
    const hiringHome = hasHiringOrganization ? hiringHomeForRole(currentRole) : "/hire/team";
    const home = user ? (surface === "hiring" ? hiringHome : config.appHome) : config.publicHome;

    const navigation = useMemo(() => {
        if (!user) return [];
        if (surface === "practice") {
            return [
                { label: "Overview", path: "/practice/dashboard", matchPrefix: "/practice/interviews/" },
                resumeNavGroup,
                { label: "Progress", path: "/practice/progress" },
                { label: "Company insights", path: "/practice/company-insights" },
            ];
        }

        const items = [];
        if (!hasHiringOrganization) return [{ label: "Set up Hire", path: "/hire/team" }];
        if (permissions.canViewOverview) items.push({ label: "Overview", path: "/hire/assessments" });
        if (permissions.canViewCandidatePipeline) items.push({ label: "Candidates", path: "/hire/assessments", hash: "#candidate-pipeline" });
        if (permissions.canViewAssessments) items.push({ label: "Assessments", path: "/hire/assessments", hash: "#assessment-list", matchPrefix: "/hire/assessments/" });
        if (permissions.canManageOrganization) items.push({ label: "Fairness", path: "/hire/fairness" });
        if (permissions.canManageOrganization) items.push({ label: "Team & billing", path: "/hire/team" });
        return items;
    }, [hasHiringOrganization, permissions.canManageOrganization, permissions.canViewAssessments, permissions.canViewCandidatePipeline, permissions.canViewOverview, surface, user]);

    const openNavItem = (item) => {
        const destination = `${item.path}${item.hash || ""}`;
        navigate(destination);
        if (item.hash) window.requestAnimationFrame(() => document.querySelector(item.hash)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };

    const handleLogout = async () => {
        await logout();
        navigate(config.publicHome, { replace: true });
    };

    const openPrimaryAction = () => {
        if (surface === "hiring") navigate("/hire/assessments?create=1", { state: { openCreate: Date.now() } });
        else navigate("/practice/new");
    };

    const selectHiringOrganization = (organization) => {
        if (!organization?._id) return;
        selectOrganization(organization._id);
        setOrganizationAnchor(null);
        navigate(hiringHomeForRole(organization.role));
    };

    const renderNavItem = (item, mobile = false) => {
        if (item.children) {
            const active = item.children.some((child) => isProductNavItemActive(location, child));
            if (mobile) {
                return (
                    <Box key={item.label}>
                        <Typography variant="overline" color="text.secondary" sx={{ px: 2, pt: 1, display: "block", fontWeight: 800 }}>{item.label}</Typography>
                        {item.children.map((child) => {
                            const ChildIcon = child.icon;
                            const childActive = isProductNavItemActive(location, child);
                            return <MenuItem key={child.label} onClick={() => openNavItem(child)} selected={childActive}>{ChildIcon && <ChildIcon fontSize="small" sx={{ mr: 1.25 }} />}{child.label}</MenuItem>;
                        })}
                    </Box>
                );
            }
            return (
                <Box key={item.label}>
                    <Button endIcon={<ExpandMoreRounded />} onClick={(event) => setNavGroupAnchor(event.currentTarget)} sx={navButtonSx(active)}>{item.label}</Button>
                    <Menu anchorEl={navGroupAnchor} open={Boolean(navGroupAnchor?.isConnected)} onClose={() => setNavGroupAnchor(null)} PaperProps={{ sx: { minWidth: 280 } }}>
                        {item.children.map((child) => {
                            const ChildIcon = child.icon;
                            const childActive = isProductNavItemActive(location, child);
                            return (
                                <MenuItem key={child.label} onClick={() => openNavItem(child)} selected={childActive}>
                                    {ChildIcon && <ChildIcon fontSize="small" sx={{ mr: 1.5, color: childActive ? "primary.main" : "text.secondary" }} />}
                                    <ListItemText primary={child.label} secondary={child.description} secondaryTypographyProps={{ sx: { whiteSpace: "normal" } }} />
                                </MenuItem>
                            );
                        })}
                    </Menu>
                </Box>
            );
        }
        const active = isProductNavItemActive(location, item);
        if (mobile) {
            return <MenuItem key={`${item.label}-${item.hash || ""}`} onClick={() => openNavItem(item)} selected={active}>{item.label}</MenuItem>;
        }
        return <Button key={`${item.label}-${item.hash || ""}`} onClick={() => openNavItem(item)} sx={navButtonSx(active)}>{item.label}</Button>;
    };

    return (
        <>
            <AppBar position="sticky" color="transparent" elevation={0} sx={{ bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", color: "text.primary", backdropFilter: "blur(18px)", zIndex: 1200 }}>
                <Container maxWidth="xl">
                    <Toolbar disableGutters sx={{ minHeight: { xs: 64, md: 72 }, gap: 1.25 }}>
                        <Stack direction="row" spacing={1.15} alignItems="center" minWidth={0} component={RouterLink} to={home} sx={{ textDecoration: "none", color: "inherit", flexShrink: 0 }}>
                            <Box sx={{ width: 34, height: 34, borderRadius: 2.5, display: "grid", placeItems: "center", color: "white", background: surface === "hiring" ? "linear-gradient(135deg,#12685f,#36aa9d)" : "linear-gradient(135deg,#1b3e9c,#2f6be0)", boxShadow: surface === "hiring" ? "0 8px 20px rgba(18,104,95,.24)" : "0 8px 20px rgba(36,81,199,.28)" }}><ProductIcon fontSize="small" /></Box>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography fontWeight={900} letterSpacing="-.025em" lineHeight={1.05} sx={{ display: { xs: "none", sm: "block" } }}>EvalcueAI</Typography>
                                <Typography variant="caption" color="text.secondary" fontWeight={800} lineHeight={1} sx={{ display: { xs: "none", sm: "block" } }}>{config.label}</Typography>
                            </Box>
                        </Stack>

                        {surface === "hiring" && user && hasHiringOrganization && organizations.length > 0 && (
                            <>
                                <Button color="inherit" size="small" endIcon={organizations.length > 1 ? <ExpandMoreRounded /> : undefined} onClick={(event) => organizations.length > 1 && setOrganizationAnchor(event.currentTarget)} sx={{ display: { xs: "none", lg: "inline-flex" }, maxWidth: 210, textTransform: "none", ml: .5 }}>
                                    <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeOrganization?.name}</Box>
                                </Button>
                                <Menu anchorEl={organizationAnchor} open={Boolean(organizationAnchor?.isConnected)} onClose={() => setOrganizationAnchor(null)}>
                                    {organizations.map((organization) => <MenuItem key={organization._id} selected={organization._id === activeOrganization?._id} onClick={() => selectHiringOrganization(organization)}><ListItemText primary={organization.name} secondary={organization.role?.replaceAll("_", " ")} /></MenuItem>)}
                                </Menu>
                            </>
                        )}

                        <Stack direction="row" spacing={.35} alignItems="center" sx={{ ml: "auto", display: { xs: "none", md: "flex" } }}>
                            {navigation.map((item) => renderNavItem(item))}
                            {user && (surface === "practice" || permissions.canManageAssessments) && <Button variant="contained" startIcon={<AddRounded />} onClick={openPrimaryAction} sx={{ ml: 1.1 }}>{surface === "hiring" ? "New assessment" : "New practice"}</Button>}
                            {!user && !loading && <>
                                <Button component={RouterLink} to={productLoginPath(config.workspace)} color="inherit">Sign in</Button>
                                <Button component={RouterLink} to={productRegisterPath(config.workspace)} variant="contained">{surface === "hiring" ? "Start hiring" : "Start practicing"}</Button>
                            </>}
                        </Stack>

                        <Stack direction="row" spacing={.25} alignItems="center" sx={{ ml: { xs: "auto", md: 1 } }}>
                            <Tooltip title={mode === "dark" ? "Use light theme" : "Use dark theme"}><IconButton onClick={toggle} aria-label="Toggle theme">{mode === "dark" ? <LightMode /> : <DarkMode />}</IconButton></Tooltip>
                            {user && <>
                                <Tooltip title="Notifications"><IconButton onClick={(event) => setNotificationAnchor(event.currentTarget)} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}><Badge color="error" badgeContent={unreadCount} max={9}><NotificationsNoneRounded /></Badge></IconButton></Tooltip>
                                <Menu anchorEl={notificationAnchor} open={Boolean(notificationAnchor?.isConnected)} onClose={() => setNotificationAnchor(null)} PaperProps={{ sx: { width: 390, maxWidth: "calc(100vw - 24px)", maxHeight: 460 } }}>
                                    <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.25}><Box><Typography fontWeight={850}>Notifications</Typography><Typography variant="caption" color="text.secondary">{unreadCount ? `${unreadCount} unread` : "You're all caught up"}</Typography></Box>{unreadCount > 0 && <Button size="small" onClick={markAllRead}>Mark read</Button>}</Stack><Divider />
                                    {notifications.length === 0 ? <Box px={2} py={3}><Typography variant="body2" color="text.secondary">No notifications yet.</Typography></Box> : notifications.slice(0, 8).map((notification) => <MenuItem key={notification.id || notification._id} onClick={() => { markNotificationRead(notification.id || notification._id); if (notification.href) navigate(notification.href); }}><ListItemText primary={notification.title || notification.message || "Notification"} secondary={notification.body || null} primaryTypographyProps={{ fontWeight: notification.read ? 500 : 800, noWrap: true }} secondaryTypographyProps={{ noWrap: true }} /></MenuItem>)}
                                </Menu>
                                <Tooltip title="Account"><IconButton onClick={(event) => setProfileAnchor(event.currentTarget)} aria-label="Account menu" sx={{ display: { xs: "none", sm: "inline-flex" } }}><Avatar sx={{ width: 34, height: 34 }}>{user?.name?.trim()?.[0]?.toUpperCase() || "U"}</Avatar></IconButton></Tooltip>
                                <Menu anchorEl={profileAnchor} open={Boolean(profileAnchor?.isConnected)} onClose={() => setProfileAnchor(null)} PaperProps={{ sx: { minWidth: 250 } }}>
                                    <Box px={2} py={1.25}><Typography fontWeight={850}>{user?.name || "Account"}</Typography><Typography variant="caption" color="text.secondary">{user?.email}</Typography></Box><Divider />
                                    {surface === "practice" && <MenuItem component={RouterLink} to="/practice/profile"><PersonOutlineRounded sx={{ mr: 1.25 }} />Profile</MenuItem>}
                                    <MenuItem onClick={() => { setProfileAnchor(null); setFeedbackOpen(true); }}><RateReviewOutlined sx={{ mr: 1.25 }} />Send feedback</MenuItem>
                                    {user?.role === "admin" && <MenuItem component={RouterLink} to="/admin"><SettingsOutlined sx={{ mr: 1.25 }} />Admin</MenuItem>}
                                    <Divider />
                                    <MenuItem onClick={handleLogout}><LogoutRounded sx={{ mr: 1.25 }} />Sign out</MenuItem>
                                </Menu>
                            </>}
                            <IconButton onClick={(event) => setMobileAnchor(event.currentTarget)} aria-label="Open navigation" sx={{ display: { xs: "inline-flex", md: "none" } }}><MenuIcon /></IconButton>
                            <Menu anchorEl={mobileAnchor} open={Boolean(mobileAnchor?.isConnected)} onClose={() => setMobileAnchor(null)} PaperProps={{ sx: { minWidth: 250 } }}>
                                {/* MUI Menu needs direct children (an array), not a Fragment, for focus and keyboard navigation. */}
                                {user ? [
                                    ...navigation.map((item) => renderNavItem(item, true)),
                                    (surface === "practice" || permissions.canManageAssessments) && <MenuItem key="primary-action" onClick={openPrimaryAction}><AddRounded sx={{ mr: 1.25 }} />{surface === "hiring" ? "New assessment" : "New practice"}</MenuItem>,
                                    <Divider key="account-divider" />,
                                    surface === "practice" && <MenuItem key="profile" component={RouterLink} to="/practice/profile" onClick={() => setMobileAnchor(null)}><PersonOutlineRounded sx={{ mr: 1.25 }} />Profile</MenuItem>,
                                    <MenuItem key="feedback" onClick={() => { setMobileAnchor(null); setFeedbackOpen(true); }}><RateReviewOutlined sx={{ mr: 1.25 }} />Send feedback</MenuItem>,
                                    user?.role === "admin" && <MenuItem key="admin" component={RouterLink} to="/admin/overview" onClick={() => setMobileAnchor(null)}><SettingsOutlined sx={{ mr: 1.25 }} />Admin</MenuItem>,
                                    <MenuItem key="sign-out" onClick={handleLogout}><LogoutRounded sx={{ mr: 1.25 }} />Sign out</MenuItem>,
                                ].filter(Boolean) : [
                                    <MenuItem key="sign-in" component={RouterLink} to={productLoginPath(config.workspace)}>Sign in</MenuItem>,
                                    <MenuItem key="register" component={RouterLink} to={productRegisterPath(config.workspace)}>{surface === "hiring" ? "Start hiring" : "Start practicing"}</MenuItem>,
                                ]}
                            </Menu>
                        </Stack>
                    </Toolbar>
                </Container>
            </AppBar>
            {feedbackOpen && <Suspense fallback={null}><ProductFeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} /></Suspense>}
        </>
    );
}

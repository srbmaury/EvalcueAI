import { lazy, Suspense, useContext, useEffect, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import {
    DarkMode,
    LightMode,
    LogoutRounded,
    Menu as MenuIcon,
    NotificationsNoneRounded,
    RateReviewOutlined,
    SettingsOutlined,
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
import { useThemeMode } from "../context/ThemeContext";
import { useNotifications } from "../context/NotificationContext";

const ProductFeedbackDialog = lazy(() => import("./ProductFeedbackDialog"));

const Brand = ({ to = "/" }) => (
    <Typography
        component={RouterLink}
        to={to}
        variant="h6"
        sx={{ display: "flex", alignItems: "center", gap: 1.15, textDecoration: "none", color: "inherit", fontWeight: 850, letterSpacing: "-.025em" }}
    >
        <Box component="span" sx={{ width: 34, height: 34, borderRadius: 1, display: "grid", placeItems: "center", color: "white", bgcolor: "primary.dark", fontSize: 16 }}>E</Box>
        <Box component="span">EvalcueAI</Box>
    </Typography>
);

export default function Header() {
    const { user, loading, logout } = useContext(AuthContext);
    const { mode, toggle } = useThemeMode();
    const { notifications, unreadCount, markNotificationRead, markAllRead } = useNotifications();
    const navigate = useNavigate();
    const location = useLocation();
    const [mobileAnchor, setMobileAnchor] = useState(null);
    const [profileAnchor, setProfileAnchor] = useState(null);
    const [notificationAnchor, setNotificationAnchor] = useState(null);
    const [feedbackOpen, setFeedbackOpen] = useState(false);

    const isCandidateAssessment = location.pathname.startsWith("/assessment/");
    const isAdmin = Boolean(user?.role === "admin");
    const isAdminSurface = isAdmin && location.pathname.startsWith("/admin");
    const adminNavSx = (path) => ({
        color: location.pathname === path ? "primary.main" : "text.secondary",
        bgcolor: location.pathname === path ? "action.selected" : "transparent",
        "&:hover": { bgcolor: "action.hover", color: "text.primary" },
    });

    useEffect(() => {
        setMobileAnchor(null);
        setProfileAnchor(null);
        setNotificationAnchor(null);
    }, [location.pathname, location.search, location.hash]);

    const handleLogout = async () => {
        await logout();
        navigate("/", { replace: true });
    };

    const closeMobile = () => setMobileAnchor(null);

    return (
        <>
            <AppBar position="sticky" color="transparent" elevation={0} sx={{ bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", color: "text.primary", zIndex: 1200, "& .MuiButton-root": { borderRadius: "4px", boxShadow: "none", fontWeight: 600 } }}>
                <Container maxWidth="lg">
                    <Toolbar disableGutters sx={{ minHeight: { xs: 64, md: 72 }, gap: 1 }}>
                        <Brand to={user && isAdmin ? "/admin/overview" : "/"} />

                        {isCandidateAssessment ? (
                            <Stack direction="row" spacing={.5} alignItems="center" sx={{ ml: "auto" }}>
                                <Button component={RouterLink} to="/privacy" color="inherit">Privacy</Button>
                                <Tooltip title={mode === "dark" ? "Use light theme" : "Use dark theme"}>
                                    <IconButton onClick={toggle} aria-label="Toggle theme">{mode === "dark" ? <LightMode /> : <DarkMode />}</IconButton>
                                </Tooltip>
                            </Stack>
                        ) : (
                            <>
                                <Stack direction="row" spacing={.35} alignItems="center" sx={{ ml: "auto", display: { xs: "none", md: isAdminSurface ? "none" : "flex", lg: "flex" } }}>
                                    {isAdminSurface ? <>
                                        <Button component={RouterLink} to="/admin/overview" sx={adminNavSx("/admin/overview")}>Overview</Button>
                                        <Button component={RouterLink} to="/admin/commercial" sx={adminNavSx("/admin/commercial")}>Commercial</Button>
                                        <Button component={RouterLink} to="/admin/jobs" sx={adminNavSx("/admin/jobs")}>Jobs</Button>
                                        <Button component={RouterLink} to="/admin/feedback" sx={adminNavSx("/admin/feedback")}>Feedback</Button>
                                        <Button component={RouterLink} to="/admin/audit" sx={adminNavSx("/admin/audit")}>Audit</Button>
                                        <Button component={RouterLink} to="/admin/calibration" sx={adminNavSx("/admin/calibration")}>AI calibration</Button>
                                    </> : <>
                                        <Button component={RouterLink} to="/practice" color="inherit">Practice</Button>
                                        <Button component={RouterLink} to="/hire" color="inherit">Hire</Button>
                                        <Button component={RouterLink} to="/plans" color="inherit">Pricing</Button>
                                        <Button component={RouterLink} to="/docs" color="inherit">Docs</Button>
                                        <Button component={RouterLink} to="/about" color="inherit">About</Button>
                                    </>}
                                    {!loading && !user && <Button component={RouterLink} to="/login" variant="contained">Sign in</Button>}
                                </Stack>

                                <Stack direction="row" spacing={.2} alignItems="center" sx={{ ml: { xs: "auto", md: 1 } }}>
                                    <Tooltip title={mode === "dark" ? "Use light theme" : "Use dark theme"}>
                                        <IconButton onClick={toggle} aria-label="Toggle theme">{mode === "dark" ? <LightMode /> : <DarkMode />}</IconButton>
                                    </Tooltip>

                                    {user && <>
                                        <Tooltip title="Notifications">
                                            <IconButton onClick={(event) => setNotificationAnchor(event.currentTarget)} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}>
                                                <Badge color="error" badgeContent={unreadCount} max={9}><NotificationsNoneRounded /></Badge>
                                            </IconButton>
                                        </Tooltip>
                                        <Menu anchorEl={notificationAnchor} open={Boolean(notificationAnchor?.isConnected)} onClose={() => setNotificationAnchor(null)} PaperProps={{ sx: { width: 390, maxWidth: "calc(100vw - 24px)", maxHeight: 460 } }}>
                                            <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.25}>
                                                <Box><Typography fontWeight={850}>Notifications</Typography><Typography variant="caption" color="text.secondary">{unreadCount ? `${unreadCount} unread` : "You're all caught up"}</Typography></Box>
                                                {unreadCount > 0 && <Button size="small" onClick={markAllRead}>Mark read</Button>}
                                            </Stack>
                                            <Divider />
                                            {notifications.length === 0 ? (
                                                <Box px={2} py={3}><Typography variant="body2" color="text.secondary">No notifications yet.</Typography></Box>
                                            ) : notifications.slice(0, 8).map((notification) => (
                                                <MenuItem key={notification.id || notification._id} onClick={() => { markNotificationRead(notification.id || notification._id); if (notification.href) navigate(notification.href); }}>
                                                    <ListItemText primary={notification.title || notification.message || "Notification"} secondary={notification.body || null} primaryTypographyProps={{ fontWeight: notification.read ? 500 : 800, noWrap: true }} secondaryTypographyProps={{ noWrap: true }} />
                                                </MenuItem>
                                            ))}
                                        </Menu>

                                        <Tooltip title="Account">
                                            <IconButton onClick={(event) => setProfileAnchor(event.currentTarget)} aria-label="Account menu" sx={{ display: { xs: "none", md: "inline-flex" } }}>
                                                <Avatar sx={{ width: 34, height: 34 }}>{user?.name?.trim()?.[0]?.toUpperCase() || "U"}</Avatar>
                                            </IconButton>
                                        </Tooltip>
                                        <Menu anchorEl={profileAnchor} open={Boolean(profileAnchor?.isConnected)} onClose={() => setProfileAnchor(null)} PaperProps={{ sx: { minWidth: 250 } }}>
                                            <Box px={2} py={1.25}><Typography fontWeight={850}>{user?.name || "Account"}</Typography><Typography variant="caption" color="text.secondary">{user?.email}</Typography></Box>
                                            <Divider />
                                            {isAdmin && <MenuItem component={RouterLink} to="/admin"><SettingsOutlined sx={{ mr: 1.25 }} />Admin console</MenuItem>}
                                            <MenuItem component={RouterLink} to="/practice/profile"><SettingsOutlined sx={{ mr: 1.25 }} />Profile & settings</MenuItem>
                                            <MenuItem onClick={() => { setProfileAnchor(null); setFeedbackOpen(true); }}><RateReviewOutlined sx={{ mr: 1.25 }} />Send feedback</MenuItem>
                                            <Divider />
                                            <MenuItem onClick={handleLogout}><LogoutRounded sx={{ mr: 1.25 }} />Sign out</MenuItem>
                                        </Menu>
                                    </>}

                                    <IconButton onClick={(event) => setMobileAnchor(event.currentTarget)} aria-label="Open navigation" sx={{ display: { xs: "inline-flex", md: isAdminSurface ? "inline-flex" : "none", lg: "none" } }}><MenuIcon /></IconButton>
                                    <Menu anchorEl={mobileAnchor} open={Boolean(mobileAnchor?.isConnected)} onClose={closeMobile} PaperProps={{ sx: { minWidth: 250 } }}>
                                        {/* MUI Menu needs direct children (arrays), not Fragments, for focus and keyboard navigation. */}
                                        {isAdminSurface ? [
                                            <MenuItem key="overview" component={RouterLink} to="/admin/overview" selected={location.pathname === "/admin/overview"} onClick={closeMobile}>Overview</MenuItem>,
                                            <MenuItem key="commercial" component={RouterLink} to="/admin/commercial" selected={location.pathname === "/admin/commercial"} onClick={closeMobile}>Commercial</MenuItem>,
                                            <MenuItem key="jobs" component={RouterLink} to="/admin/jobs" selected={location.pathname === "/admin/jobs"} onClick={closeMobile}>Jobs</MenuItem>,
                                            <MenuItem key="feedback-admin" component={RouterLink} to="/admin/feedback" selected={location.pathname === "/admin/feedback"} onClick={closeMobile}>Feedback</MenuItem>,
                                            <MenuItem key="audit" component={RouterLink} to="/admin/audit" selected={location.pathname === "/admin/audit"} onClick={closeMobile}>Audit</MenuItem>,
                                            <MenuItem key="calibration" component={RouterLink} to="/admin/calibration" selected={location.pathname === "/admin/calibration"} onClick={closeMobile}>AI calibration</MenuItem>,
                                        ] : [
                                            <MenuItem key="practice" component={RouterLink} to="/practice" onClick={closeMobile}>Practice</MenuItem>,
                                            <MenuItem key="hire" component={RouterLink} to="/hire" onClick={closeMobile}>Hire</MenuItem>,
                                            <MenuItem key="pricing" component={RouterLink} to="/plans" onClick={closeMobile}>Pricing</MenuItem>,
                                            <MenuItem key="docs" component={RouterLink} to="/docs" onClick={closeMobile}>Docs</MenuItem>,
                                            <MenuItem key="about" component={RouterLink} to="/about" onClick={closeMobile}>About</MenuItem>,
                                        ]}
                                        {user ? [
                                            <Divider key="account-divider" />,
                                            <MenuItem key="profile" component={RouterLink} to="/practice/profile" onClick={closeMobile}>Profile & settings</MenuItem>,
                                            <MenuItem key="send-feedback" onClick={() => { closeMobile(); setFeedbackOpen(true); }}><RateReviewOutlined fontSize="small" sx={{ mr: 1.25 }} />Send feedback</MenuItem>,
                                            <MenuItem key="sign-out" onClick={handleLogout}><LogoutRounded fontSize="small" sx={{ mr: 1.25 }} />Sign out</MenuItem>,
                                        ] : !loading ? [
                                            <Divider key="guest-divider" />,
                                            <MenuItem key="sign-in" component={RouterLink} to="/login" onClick={closeMobile}>Sign in</MenuItem>,
                                        ] : null}
                                    </Menu>
                                </Stack>
                            </>
                        )}
                    </Toolbar>
                </Container>
            </AppBar>
            {feedbackOpen && <Suspense fallback={null}><ProductFeedbackDialog open onClose={() => setFeedbackOpen(false)} /></Suspense>}
        </>
    );
}

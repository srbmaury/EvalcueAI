import { Route, Routes, Navigate, useLocation } from "react-router-dom";
import { lazy, Suspense, useState } from "react";
import { Box, CircularProgress } from "@mui/material";

import Header from "./components/Header";
import ProductHeader from "./components/ProductHeader";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import AdminRoute from "./components/AdminRoute";
import GuestOnlyRoute from "./components/GuestOnlyRoute";
import HiringOrganizationGate from "./components/HiringOrganizationGate";
import SearchIndexPolicy from "./components/SearchIndexPolicy";
import CanonicalProductRedirect from "./components/CanonicalProductRedirect";
import DeploymentSurfaceGuard from "./components/DeploymentSurfaceGuard";

const CreateInterviewPage = lazy(() => import("./pages/CreateInterviewPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage.jsx"));
const InterviewPage = lazy(() => import("./pages/InterviewPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ProfilePage = lazy(() => import("./pages/ProfileSettingsPage.jsx"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage.jsx"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage.jsx"));
const ExperiencesPage = lazy(() => import("./pages/ExperiencesPage.jsx"));
const ResumeReviewPage = lazy(() => import("./pages/ResumeReviewPage.jsx"));
const ResumeMatcherPage = lazy(() => import("./pages/ResumeMatcherPage.jsx"));
const LandingPage = lazy(() => import("./pages/LandingPage.jsx"));
const ProductLandingPage = lazy(() => import("./pages/ProductLandingPage.jsx"));
const ProductResourcePage = lazy(() => import("./pages/ProductResourcePage.jsx"));
const LegalPage = lazy(() => import("./pages/LegalPage.jsx"));
const ProgressPage = lazy(() => import("./pages/ProgressPage.jsx"));
const ReviewHistoryPage = lazy(() => import("./pages/ReviewHistoryPage.jsx"));
const SavedExperiencesPage = lazy(() => import("./pages/SavedExperiencesPage.jsx"));
const ResumesPage = lazy(() => import("./pages/ResumesPage.jsx"));
const PricingPage = lazy(() => import("./pages/PricingPage.jsx"));
const BillingSuccessPage = lazy(() => import("./pages/BillingSuccessPage.jsx"));
const AdminOverviewPage = lazy(() => import("./pages/AdminOverviewPage.jsx"));
const AdminJobsPage = lazy(() => import("./pages/AdminJobsPage.jsx"));
const AdminFeedbackPage = lazy(() => import("./pages/AdminFeedbackPage.jsx"));
const AdminAuditPage = lazy(() => import("./pages/AdminAuditPage.jsx"));
const AdminCalibrationPage = lazy(() => import("./pages/AdminCalibrationPage.jsx"));
const AdminCommercialAccessPage = lazy(() => import("./pages/AdminCommercialAccessPage.jsx"));
const HiringWorkspacePage = lazy(() => import("./pages/HiringWorkspacePage.jsx"));
const AssessmentReportPage = lazy(() => import("./pages/AssessmentReportPage.jsx"));
const CandidateAssessmentPage = lazy(() => import("./pages/CandidateAssessmentPage.jsx"));
const AssessmentPreviewPage = lazy(() => import("./pages/AssessmentPreviewPage.jsx"));
const HiringTeamPage = lazy(() => import("./pages/HiringTeamPage.jsx"));
const HiringPilotPage = lazy(() => import("./pages/HiringPilotPage.jsx"));
const SsoCallbackPage = lazy(() => import("./pages/SsoCallbackPage.jsx"));
const SsoSettingsPage = lazy(() => import("./pages/SsoSettingsPage.jsx"));
const PublicDocsPage = lazy(() => import("./pages/PublicDocsPage.jsx"));
const OidcSsoDocsPage = lazy(() => import("./pages/OidcSsoDocsPage.jsx"));

const PageLoader = () => (
    <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }} role="status" aria-label="Loading page">
        <CircularProgress />
    </Box>
);

const HiringRoute = ({ children }) => (
    <ProtectedRoute>
        <HiringOrganizationGate>{children}</HiringOrganizationGate>
    </ProtectedRoute>
);

const ProductAwareHeader = () => {
    const location = useLocation();
    if (location.pathname === "/practice" || location.pathname.startsWith("/practice/")) return <ProductHeader surface="practice" />;
    if (location.pathname === "/hire" || location.pathname.startsWith("/hire/")) return <ProductHeader surface="hiring" />;
    return <Header />;
};

function App() {
    const [showSkip, setShowSkip] = useState(false);
    const hiddenStyle = { position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden", zIndex: 10000 };
    const visibleStyle = { position: "absolute", left: 8, top: 8, background: "#fff", color: "#000", padding: "8px 12px", borderRadius: 4, boxShadow: "0 1px 4px rgba(0,0,0,0.2)", zIndex: 10000 };
    return (
        <DeploymentSurfaceGuard>
        <div className="min-h-screen">
            <SearchIndexPolicy />
            <a href="#main-content" onFocus={() => setShowSkip(true)} onBlur={() => setShowSkip(false)} style={showSkip ? visibleStyle : hiddenStyle}>Skip to main content</a>
            <ProductAwareHeader />
            <main id="main-content">
                <ErrorBoundary><Suspense fallback={<PageLoader />}><Routes>
                <Route path="/" element={<GuestOnlyRoute><LandingPage /></GuestOnlyRoute>} />
                <Route path="/practice" element={<ProductLandingPage surface="practice" />} />
                <Route path="/hire" element={<ProductLandingPage surface="hiring" />} />
                <Route path="/practice/resources/:slug" element={<ProductResourcePage surface="practice" />} />
                <Route path="/hire/resources/:slug" element={<ProductResourcePage surface="hiring" />} />
                <Route path="/interview-practice" element={<CanonicalProductRedirect />} />
                <Route path="/technical-hiring" element={<CanonicalProductRedirect />} />
                <Route path="/practice/login" element={<GuestOnlyRoute><LoginPage /></GuestOnlyRoute>} />
                <Route path="/practice/register" element={<GuestOnlyRoute><RegisterPage /></GuestOnlyRoute>} />
                <Route path="/hire/login" element={<GuestOnlyRoute><LoginPage /></GuestOnlyRoute>} />
                <Route path="/hire/register" element={<GuestOnlyRoute><RegisterPage /></GuestOnlyRoute>} />
                <Route path="/login" element={<GuestOnlyRoute><LoginPage /></GuestOnlyRoute>} />
                <Route path="/register" element={<GuestOnlyRoute><RegisterPage /></GuestOnlyRoute>} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/sso/callback" element={<SsoCallbackPage />} />
                <Route path="/privacy" element={<LegalPage type="privacy" />} />
                <Route path="/terms" element={<LegalPage type="terms" />} />
                <Route path="/docs" element={<PublicDocsPage />} />
                <Route path="/docs/hiring/oidc-sso" element={<OidcSsoDocsPage />} />
                <Route path="/docs/*" element={<PublicDocsPage />} />
                <Route path="/assessment/:shareToken" element={<CandidateAssessmentPage />} />
                <Route path="/practice/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/practice/company-insights" element={<ProtectedRoute><ExperiencesPage /></ProtectedRoute>} />
                <Route path="/practice/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/practice/progress" element={<ProtectedRoute><ProgressPage /></ProtectedRoute>} />
                <Route path="/practice/resume-reviews" element={<ProtectedRoute><ReviewHistoryPage /></ProtectedRoute>} />
                <Route path="/practice/resume-match" element={<ProtectedRoute><ResumeMatcherPage /></ProtectedRoute>} />
                <Route path="/practice/saved-experiences" element={<ProtectedRoute><SavedExperiencesPage /></ProtectedRoute>} />
                <Route path="/practice/resumes" element={<ProtectedRoute><ResumesPage /></ProtectedRoute>} />
                <Route path="/practice/pricing" element={<ProtectedRoute><PricingPage /></ProtectedRoute>} />
                <Route path="/practice/billing/success" element={<ProtectedRoute><BillingSuccessPage /></ProtectedRoute>} />
                <Route path="/practice/new" element={<ProtectedRoute><CreateInterviewPage /></ProtectedRoute>} />
                <Route path="/practice/resume-review" element={<ProtectedRoute><ResumeReviewPage /></ProtectedRoute>} />
                <Route path="/practice/interviews/:interviewId" element={<ProtectedRoute><InterviewPage /></ProtectedRoute>} />
                <Route path="/hire/assessments" element={<HiringRoute><HiringWorkspacePage /></HiringRoute>} />
                <Route path="/hire/assessments/:assessmentId" element={<HiringRoute><AssessmentReportPage /></HiringRoute>} />
                <Route path="/hire/assessments/:assessmentId/preview" element={<HiringRoute><AssessmentPreviewPage /></HiringRoute>} />
                <Route path="/hire/team" element={<HiringRoute><HiringTeamPage /></HiringRoute>} />
                <Route path="/hire/pilot" element={<HiringRoute><HiringPilotPage /></HiringRoute>} />
                <Route path="/hire/billing/success" element={<ProtectedRoute><BillingSuccessPage /></ProtectedRoute>} />
                <Route path="/hire/sso" element={<HiringRoute><SsoSettingsPage /></HiringRoute>} />
                <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
                <Route path="/admin/overview" element={<ProtectedRoute><AdminRoute><AdminOverviewPage /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/jobs" element={<ProtectedRoute><AdminRoute><AdminJobsPage /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/commercial" element={<ProtectedRoute><AdminRoute><AdminCommercialAccessPage /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/feedback" element={<ProtectedRoute><AdminRoute><AdminFeedbackPage /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/audit" element={<ProtectedRoute><AdminRoute><AdminAuditPage /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/calibration" element={<ProtectedRoute><AdminRoute><AdminCalibrationPage /></AdminRoute></ProtectedRoute>} />
                <Route path="/dashboard" element={<CanonicalProductRedirect />} />
                <Route path="/experiences" element={<CanonicalProductRedirect />} />
                <Route path="/profile" element={<CanonicalProductRedirect />} />
                <Route path="/progress" element={<CanonicalProductRedirect />} />
                <Route path="/resume-reviews" element={<CanonicalProductRedirect />} />
                <Route path="/resume-match" element={<CanonicalProductRedirect />} />
                <Route path="/saved-experiences" element={<CanonicalProductRedirect />} />
                <Route path="/resumes" element={<CanonicalProductRedirect />} />
                <Route path="/pricing" element={<CanonicalProductRedirect />} />
                <Route path="/billing/success" element={<CanonicalProductRedirect />} />
                <Route path="/create-interview" element={<CanonicalProductRedirect />} />
                <Route path="/resume-review" element={<CanonicalProductRedirect />} />
                <Route path="/interviews/:interviewId" element={<CanonicalProductRedirect />} />
                <Route path="/assessments" element={<CanonicalProductRedirect />} />
                <Route path="/assessments/:assessmentId" element={<CanonicalProductRedirect />} />
                <Route path="/assessments/:assessmentId/preview" element={<CanonicalProductRedirect />} />
                <Route path="/hiring/team" element={<CanonicalProductRedirect />} />
                <Route path="/hiring/sso" element={<CanonicalProductRedirect />} />
                <Route path="/practice/*" element={<Navigate to="/practice" replace />} />
                <Route path="/hire/*" element={<Navigate to="/hire" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
                </Routes></Suspense></ErrorBoundary>
            </main>
        </div>
        </DeploymentSurfaceGuard>
    );
}

export default App;

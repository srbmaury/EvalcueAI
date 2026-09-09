import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { OrganizationProvider } from "./context/OrganizationContext.jsx";
import { BrowserRouter } from "react-router-dom";
import "./index.css";

import { ThemeModeProvider } from "./context/ThemeContext.jsx";
import { NotificationProvider } from "./context/NotificationContext.jsx";
import PublicRouteSeo from "./components/PublicRouteSeo.jsx";
import { installCandidateAttemptStoragePolicy } from "./utils/candidateAttemptStoragePolicy.js";

// Keep candidate recovery credentials tab-scoped rather than persisted across
// browser restarts or shared-browser users.
installCandidateAttemptStoragePolicy();

// Public VITE_* deployment settings are embedded into each surface at build time.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeModeProvider>
      <BrowserRouter>
        <PublicRouteSeo />
        <AuthProvider>
          <NotificationProvider>
            <OrganizationProvider>
              <App />
            </OrganizationProvider>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeModeProvider>
  </React.StrictMode>
);
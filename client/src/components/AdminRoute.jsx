import { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { productHomePath, surfaceForPath, workspaceForSurface } from "../utils/productRoutes";

export default function AdminRoute({ children }) {
    const { user } = useContext(AuthContext);
    const location = useLocation();
    if (user?.role === "admin") return children;

    const workspace = workspaceForSurface(surfaceForPath(location.pathname)) || "practice";
    return <Navigate to={productHomePath(workspace)} replace />;
}

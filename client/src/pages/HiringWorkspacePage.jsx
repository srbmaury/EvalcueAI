import { useSearchParams } from "react-router-dom";
import AssessmentBuilderPage from "./AssessmentBuilderPage";
import AssessmentsPage from "./AssessmentsPage";

export default function HiringWorkspacePage() {
    const [searchParams] = useSearchParams();
    const isBuilding = searchParams.get("create") === "1" || Boolean(searchParams.get("edit"));
    return isBuilding ? <AssessmentBuilderPage /> : <AssessmentsPage />;
}

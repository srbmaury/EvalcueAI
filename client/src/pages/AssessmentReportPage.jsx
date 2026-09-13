import { useParams } from "react-router-dom";
import DebuggingReportEvidenceSection from "../components/DebuggingReportEvidenceSection";
import AssessmentReportPageLegacy from "./AssessmentReportPageLegacy";

export default function AssessmentReportPage() {
    const { assessmentId } = useParams();
    return (
        <>
            <AssessmentReportPageLegacy />
            <DebuggingReportEvidenceSection assessmentId={assessmentId} />
        </>
    );
}

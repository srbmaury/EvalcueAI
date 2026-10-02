import { useParams } from "react-router-dom";
import DebuggingReportEvidenceSection from "../components/DebuggingReportEvidenceSection";
import AssessmentReportContent from "./AssessmentReportContent";

export default function AssessmentReportPage() {
    const { assessmentId } = useParams();
    return (
        <>
            <AssessmentReportContent />
            <DebuggingReportEvidenceSection assessmentId={assessmentId} />
        </>
    );
}

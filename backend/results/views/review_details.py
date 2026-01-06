from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from results.models import InterviewResult
from interviews.models import VideoResponse
from common.permissions import IsHRUser


class InterviewReviewDetails(APIView):
    """
    Heavy interview review details (AI analysis, transcripts, per-question data).
    """

    permission_classes = [IsAuthenticated, IsHRUser]

    def get(self, request, pk):
        result = get_object_or_404(
            InterviewResult.objects.select_related("interview"),
            pk=pk,
        )
        interview = result.interview

        # Prefetch video responses with related question and ai_analysis
        video_responses = (
            VideoResponse.objects.filter(interview=interview)
            .select_related("question", "hr_reviewer", "ai_analysis")
            .order_by("question__order")
        )

        videos_payload = []
        scores_by_competency = {}

        def build_answer_integrity(video_response, ai_analysis):
            transcript_text = (getattr(video_response, "transcript", "") or "").strip()
            transcript_length = len(transcript_text)
            raw_scores = {}
            if ai_analysis and isinstance(getattr(ai_analysis, "langchain_analysis_data", None), dict):
                analysis_data = ai_analysis.langchain_analysis_data or {}
                raw_scores = analysis_data.get("raw_scores", {}) if isinstance(analysis_data, dict) else {}
                if not isinstance(raw_scores, dict):
                    raw_scores = {}

            def get_bool_flag(*keys):
                for key in keys:
                    value = raw_scores.get(key)
                    if isinstance(value, bool):
                        return value
                return False

            no_response = (
                get_bool_flag("no_response", "noResponse", "no_answer")
                or raw_scores.get("technical_issue") is True
                or raw_scores.get("issue_type") == "no_audio"
                or transcript_length == 0
            )
            silence_triggered = get_bool_flag("silence_exceeded", "silenceExceeded", "silence_triggered")
            repetition_only = get_bool_flag(
                "repetition_only", "repetitionDetected", "repetition_detected", "repetition_only_response"
            )
            content_relevance_score = getattr(ai_analysis, "content_relevance_score", None) if ai_analysis else None
            content_free = False
            if content_relevance_score is not None:
                try:
                    content_free = float(content_relevance_score) < 40
                except (TypeError, ValueError):
                    content_free = False

            if no_response:
                answer_type = "no_response"
            elif repetition_only:
                answer_type = "repetition_only"
            elif content_free:
                answer_type = "content_free"
            else:
                answer_type = "normal"

            integrity_note = ""
            if answer_type == "no_response":
                integrity_note = "No transcript available"
            elif answer_type in {"repetition_only", "content_free"} or silence_triggered:
                integrity_note = "Review suggested"

            return {
                "answer_type": answer_type,
                "silence_triggered": bool(silence_triggered),
                "integrity_note": integrity_note or None,
                "transcript_length": transcript_length,
            }

        for vr in video_responses:
            ai_assessment = ""
            ai_scoring = {
                "sentiment_score": None,
                "confidence_score": None,
                "speech_clarity_score": None,
                "content_relevance_score": None,
                "overall_score": None,
            }
            if getattr(vr, "ai_analysis", None):
                analysis_data = vr.ai_analysis.langchain_analysis_data
                ai_assessment = analysis_data.get("analysis_summary", "") or analysis_data.get("raw_scores", {}).get(
                    "analysis_summary", ""
                )
                ai_scoring = {
                    "sentiment_score": getattr(vr.ai_analysis, "sentiment_score", None),
                    "confidence_score": getattr(vr.ai_analysis, "confidence_score", None),
                    "speech_clarity_score": getattr(vr.ai_analysis, "speech_clarity_score", None),
                    "content_relevance_score": getattr(vr.ai_analysis, "content_relevance_score", None),
                    "overall_score": getattr(vr.ai_analysis, "overall_score", None),
                }

            videos_payload.append(
                {
                    "id": vr.id,
                    "question": {
                        "id": vr.question.id,
                        "question_text": vr.question.question_text,
                        "question_type": vr.question.question_type.name if vr.question.question_type else None,
                        "order": vr.question.order,
                    },
                    "video_file": vr.video_file_path.url if vr.video_file_path else None,
                    "video_url": request.build_absolute_uri(vr.video_file_path.url) if vr.video_file_path else None,
                    "transcript": vr.transcript or "",
                    "ai_score": vr.ai_score or 0,
                    "ai_assessment": ai_assessment,
                    "ai_scoring": ai_scoring,
                    "sentiment": vr.sentiment or "",
                    "script_reading_status": vr.script_reading_status,
                    "script_reading_data": vr.script_reading_data,
                    "hr_override_score": vr.hr_override_score,
                    "hr_comments": vr.hr_comments,
                    "status": vr.status if hasattr(vr, "status") else "completed",
                    "answer_integrity": build_answer_integrity(vr, getattr(vr, "ai_analysis", None)),
                }
            )
            score = vr.final_score
            if score is not None:
                competency = getattr(vr.question, "competency", None) or "communication"
                bucket_total, bucket_count = scores_by_competency.get(competency, (0.0, 0))
                scores_by_competency[competency] = (bucket_total + score, bucket_count + 1)

        from interviews.scoring import compute_competency_scores

        competency_score_data = compute_competency_scores(
            scores_by_competency=scores_by_competency,
            role_code=getattr(interview.position_type, "code", None),
        )

        return Response(
            {
                "video_responses": videos_payload,
                "raw_scores_per_competency": competency_score_data["raw_scores_per_competency"],
                "weighted_scores_per_competency": competency_score_data["weighted_scores_per_competency"],
                "final_weighted_score": competency_score_data["final_weighted_score"],
                "weights_used": competency_score_data["weights_used"],
                "role_profile": competency_score_data["role_profile"],
                "ai_recommendation_explanation": competency_score_data["ai_recommendation_explanation"],
                "integrity_metadata": getattr(interview, "integrity_metadata", None) or {},
                "consent_acknowledged_at": getattr(interview, "consent_acknowledged_at", None),
            }
        )

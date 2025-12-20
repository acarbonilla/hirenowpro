"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { getHRToken } from "@/lib/auth-hr";
import VideoPlayer from "@/components/VideoPlayer";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// TYPES --------------------------------------------------------------

interface Question {
  id: number;
  question_text: string;
  question_type: string;
}

interface VideoResponse {
  id: number;
  question: Question;
  video_file: string | null;
  transcript: string | null;
  ai_score: number;
  ai_assessment: string | null;
  ai_scoring?: {
    sentiment_score?: number | null;
    confidence_score?: number | null;
    speech_clarity_score?: number | null;
    content_relevance_score?: number | null;
    overall_score?: number | null;
  };
  sentiment: number | string;
  hr_override_score?: number;
  hr_comments?: string;
  status: string;
}

interface ReviewData {
  result_id: number;
  interview_id: number;
  applicant: {
    id: number;
    full_name: string;
    email: string;
    phone: string;
  };
  position_type: string;
  overall_score: number;
  ai_overall_score?: number | null;
  passed: boolean;
  recommendation?: string;
  hr_decision?: "hire" | "reject" | "hold" | null;
  hr_comment?: string | null;
  hold_until?: string | null;
  hr_decision_at?: string | null;
  final_decision?: "hired" | "rejected" | null;
  final_decision_date?: string | null;
  final_decision_notes?: string | null;
  created_at: string;
  video_responses?: VideoResponse[];
}

const DetailsSkeleton = () => (
  <div className="space-y-4">
    <div className="h-48 bg-gray-100 animate-pulse rounded-xl" />
    <div className="h-32 bg-gray-100 animate-pulse rounded-xl" />
    <div className="h-40 bg-gray-100 animate-pulse rounded-xl" />
  </div>
);

// COMPONENT --------------------------------------------------------------

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams();

  // Handle Next.js quirk: params.id can be string | string[]
  const resultId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showAIScoring, setShowAIScoring] = useState(false);

  const [overrideForm, setOverrideForm] = useState({
    score: "",
    comments: "",
  });

  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionType, setDecisionType] = useState<"hire" | "reject" | "hold" | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [holdUntil, setHoldUntil] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [viewedQuestions, setViewedQuestions] = useState<number[]>([]);

  // FETCH DATA --------------------------------------------------------------

  const fetchReviewData = async () => {
    if (!resultId) {
      setError("Invalid result ID");
      setLoading(false);
      setDetailsLoading(false);
      return;
    }

    setLoading(true);
    setDetailsLoading(true);

    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [summaryRes, detailsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/results/${resultId}/review/summary/`, {
          headers,
          timeout: 10000,
        }),
        axios.get(`${API_BASE_URL}/results/${resultId}/review/details/`, {
          headers,
          timeout: 20000,
        }),
      ]);

      const summary: ReviewData = summaryRes.data;
      const details = detailsRes.data || {};

      const merged = { ...summary, ...details };
      setReviewData(merged);
      const videos = details.video_responses || [];
      setSelectedVideo(videos.length ? videos[0] : null);
      setError("");
    } catch (err: any) {
      if (err.response?.status === 401) {
        router.push("/hr-login");
        return;
      }
      setError(err.response?.data?.detail || "Failed to load review data");
    } finally {
      setLoading(false);
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    fetchReviewData();
  }, [resultId]);

  useEffect(() => {
    if (!reviewData) return;
    setDecisionType(reviewData.hr_decision ?? null);
    setDecisionNotes(reviewData.hr_comment ?? "");
    setHoldUntil(reviewData.hold_until ? reviewData.hold_until.slice(0, 16) : "");
    const firstVideoId = reviewData.video_responses?.[0]?.id;
    setViewedQuestions(firstVideoId ? [firstVideoId] : []);
  }, [reviewData]);

  useEffect(() => {
    if (!selectedVideo?.id) return;
    setViewedQuestions((prev) => (prev.includes(selectedVideo.id) ? prev : [...prev, selectedVideo.id]));
  }, [selectedVideo?.id]);

  // SCORE OVERRIDE --------------------------------------------------------------

  const handleOverrideSubmit = async () => {
    if (!overrideForm.score) {
      alert("Enter a score first.");
      return;
    }
    if (!selectedVideo) return;

    const score = Number(overrideForm.score);
    if (isNaN(score) || score < 0 || score > 100) {
      alert("Score must be between 0 and 100");
      return;
    }
    const trimmedComments = overrideForm.comments.trim();
    if (typeof selectedVideo.ai_score === "number") {
      const delta = Math.abs(score - selectedVideo.ai_score);
      if (delta > 20 && trimmedComments.length < 20) {
        alert("Comment must be at least 20 characters when override delta exceeds 20 points.");
        return;
      }
    }

    setSubmitting(true);

    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      await axios.post(
        `${API_BASE_URL}/results/${resultId}/override-score/`,
        {
          video_response_id: selectedVideo.id,
          override_score: score,
          comments: trimmedComments,
        },
        { headers }
      );

      alert("Override saved!");
      fetchReviewData(); // refresh
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to save override");
    } finally {
      setSubmitting(false);
    }
  };

  // FINAL HR DECISION --------------------------------------------------------------

  const handleFinalDecision = async () => {
    if (!decisionType || !reviewData) return;

    const trimmedReason = decisionNotes.trim();

    if (decisionType === "hold") {
      if (!holdUntil) {
        setDecisionError("Hold follow-up date is required.");
        return;
      }
      if (!trimmedReason) {
        setDecisionError("Comment is required when placing on hold.");
        return;
      }
    }

    setSubmitting(true);
    setDecisionError("");

    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await axios.post(
        `${API_BASE_URL}/hr/interviews/${reviewData.interview_id}/decision/`,
        {
          decision: decisionType,
          hr_comment: trimmedReason || undefined,
          hold_until: decisionType === "hold" ? holdUntil : undefined,
        },
        { headers }
      );

      alert(`HR decision recorded: ${decisionType}`);
      setReviewData((prev) =>
        prev
          ? {
              ...prev,
              hr_decision: response.data?.hr_decision ?? decisionType,
              hr_comment: response.data?.hr_comment ?? trimmedReason,
              hold_until: response.data?.hold_until ?? (decisionType === "hold" ? holdUntil : null),
              hr_decision_at: response.data?.hr_decision_at ?? new Date().toISOString(),
            }
          : prev
      );
    } catch (err: any) {
      alert(err.response?.data?.detail || err.response?.data?.hr_comment || "Failed to save decision");
    } finally {
      setSubmitting(false);
      setShowDecisionModal(false);
    }
  };

  // COLOR HELPERS --------------------------------------------------------------

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-700 bg-green-100";
    if (score >= 60) return "text-yellow-700 bg-yellow-100";
    return "text-red-700 bg-red-100";
  };

  const getSentimentColor = (s: number | string) => {
    if (typeof s === "number") {
      if (s >= 60) return "text-green-700 bg-green-100";
      if (s >= 30) return "text-yellow-700 bg-yellow-100";
      return "text-red-700 bg-red-100";
    }

    switch (s?.toLowerCase()) {
      case "positive":
        return "text-green-700 bg-green-100";
      case "neutral":
        return "text-yellow-700 bg-yellow-100";
      case "negative":
        return "text-red-700 bg-red-100";
      default:
        return "text-gray-700 bg-gray-100";
    }
  };

  const renderScoreBar = (value: number | null | undefined, emphasize = false) => {
    const safeValue = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
    const width = safeValue === null ? "0%" : `${safeValue}%`;
    const barClass = emphasize ? "bg-orange-600" : "bg-blue-600";
    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`${barClass} h-2 rounded-full transition-all duration-500`} style={{ width }}></div>
      </div>
    );
  };

  // LOADING --------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-12 w-12 border-t-2 border-b-2 border-purple-600 rounded-full"></div>
      </div>
    );
  }

  if (error || !reviewData) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 text-xl">{error}</p>
        <Link href="/hr-dashboard/results" className="text-purple-600 hover:text-purple-800 mt-4 inline-block">
          Back to Interview Review
        </Link>
      </div>
    );
  }

  const aiRecommendation = reviewData.recommendation;
  const hrDecision = reviewData.hr_decision ?? null;
  const finalDecision = reviewData.final_decision ?? null;
  const effectiveDecision =
    hrDecision === "hire" || hrDecision === "reject" || hrDecision === "hold"
      ? hrDecision
      : finalDecision === "hired" || finalDecision === "rejected"
        ? finalDecision === "hired"
          ? "hire"
          : "reject"
        : null;
  const decisionLabel =
    effectiveDecision === "hire"
      ? "Hired"
      : effectiveDecision === "reject"
        ? "Rejected"
        : effectiveDecision === "hold"
          ? "On Hold"
          : "Pending HR Review";
  const decisionClass =
    effectiveDecision === "hire"
      ? "bg-green-100 text-green-800"
      : effectiveDecision === "reject"
        ? "bg-red-100 text-red-800"
        : effectiveDecision === "hold"
          ? "bg-blue-100 text-blue-800"
          : "bg-yellow-100 text-yellow-800";
  const aiDecision = aiRecommendation === "hire" ? "hire" : aiRecommendation === "reject" ? "reject" : null;
  const decisionOverride =
    aiDecision && (effectiveDecision === "hire" || effectiveDecision === "reject") && effectiveDecision !== aiDecision;
  const decisionReason = reviewData.hr_comment?.trim();
  const showPendingNote = !effectiveDecision && aiRecommendation === "hire";
  const isDecisionFinal = effectiveDecision === "hire" || effectiveDecision === "reject" || effectiveDecision === "hold";
  const aiOverallScore = reviewData.ai_overall_score ?? null;
  const hrAdjustedScore = reviewData.overall_score ?? null;
  const isDecisionLocked = !!reviewData.hr_decision || !!reviewData.final_decision;
  const trimmedComment = decisionNotes.trim();
  const commentRequired = decisionType === "hold";
  const commentValid = !commentRequired || trimmedComment.length > 0;
  const holdValid = decisionType !== "hold" || !!holdUntil;
  const canFinalize = !isDecisionLocked && !submitting && !!decisionType && holdValid && commentValid;
  const aiOverallDisplay =
    aiOverallScore !== null && aiOverallScore !== undefined ? Math.round(aiOverallScore).toString() : "N/A";
  const hrAdjustedDisplay =
    hrAdjustedScore !== null && hrAdjustedScore !== undefined ? Math.round(hrAdjustedScore).toString() : "N/A";
  const totalQuestions = reviewData.video_responses?.length ?? 0;
  const reviewedCount = viewedQuestions.length;
  const hasUnreviewed = totalQuestions > 0 && reviewedCount < totalQuestions;

  const openDecisionModal = () => {
    if (!canFinalize) return;
    setDecisionError("");
    setShowDecisionModal(true);
  };
  const recommendationLabel =
    aiRecommendation === "hire" ? "Pass" : aiRecommendation === "review" ? "Review" : aiRecommendation === "reject" ? "Fail" : "N/A";
  const recommendationClass =
    aiRecommendation === "hire"
      ? "bg-green-100 text-green-800"
      : aiRecommendation === "reject"
        ? "bg-red-100 text-red-800"
        : aiRecommendation === "review"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-gray-100 text-gray-600";
  const decisionTypeLabel =
    decisionType === "hire" ? "Hire" : decisionType === "reject" ? "Reject" : decisionType === "hold" ? "Hold" : "";

  // UI START --------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <Link href="/hr-dashboard/review-queue" className="text-purple-600 hover:text-purple-800 text-sm">
            ← Back
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Interview Review</h1>
          <p className="text-gray-600">Reviewing {reviewData.applicant.full_name}</p>
        </div>

        <button
          onClick={() => window.print()}
          disabled={detailsLoading}
          className={`px-4 py-2 rounded-lg text-white ${detailsLoading ? "bg-gray-400 cursor-not-allowed" : "bg-gray-600 hover:bg-gray-700"}`}
        >
          Print
        </button>
      </div>

      <div className="bg-white p-5 shadow rounded-xl border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">AI Recommendation</p>
            <span className={`inline-flex mt-2 px-2 py-1 rounded-full text-xs font-semibold ${recommendationClass}`}>
              {recommendationLabel}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-600">Final HR Decision</p>
            <span className={`inline-flex mt-2 px-2 py-1 rounded-full text-xs font-semibold ${decisionClass}`}>
              {decisionLabel}
            </span>
            {showPendingNote && (
              <p className="mt-2 text-xs text-yellow-700">AI score passed the threshold. Waiting for HR final review.</p>
            )}
            {decisionOverride && (
              <p className="mt-2 text-xs text-orange-700">Decision overridden by HR</p>
            )}
            {decisionReason && (
              <p className="mt-2 text-xs text-gray-600">Reason: {decisionReason}</p>
            )}
          </div>
        </div>
      </div>

      {/* Applicant Info */}
      <div className="bg-white p-6 shadow rounded-xl border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-600">Name</p>
            <p className="font-semibold">{reviewData.applicant.full_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Email</p>
            <p className="font-semibold">{reviewData.applicant.email}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Phone</p>
            <p className="font-semibold">{reviewData.applicant.phone}</p>
          </div>
        </div>
      </div>

      {/* Interview-Level Decision Warning */}
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="text-yellow-600 text-lg" aria-hidden="true">
            ⚠️
          </span>
          <div>
            <p className="text-sm font-semibold text-yellow-800">Interview-Level Decision Warning</p>
            <p className="text-sm text-yellow-700">
              You are reviewing one question at a time. The final HR decision applies to the entire interview. Please
              review all questions before finalizing.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-yellow-800">
          <p>
            Questions reviewed: {reviewedCount} / {totalQuestions}
          </p>
          {hasUnreviewed && <p className="text-xs text-yellow-700">Some questions are still unreviewed.</p>}
        </div>
      </div>

      {/* VIDEO LIST + PLAYER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* VIDEO LIST */}
        <div className="bg-white p-6 rounded-xl shadow border">
          <h3 className="text-lg font-semibold mb-4">
            Questions ({reviewData.video_responses ? reviewData.video_responses.length : 0})
          </h3>

          {detailsLoading && <p className="text-sm text-gray-500 mb-2">Loading detailed responses...</p>}

          <div className="space-y-2">
            {(reviewData.video_responses || []).map((v, i) => {
              const score = v.hr_override_score ?? v.ai_score;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVideo(v)}
                  className={`w-full text-left p-3 rounded-lg border ${
                    selectedVideo?.id === v.id
                      ? "bg-purple-100 border-purple-600"
                      : "bg-gray-50 border-transparent hover:bg-gray-100"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-sm">Question {i + 1}</p>
                      <p className="text-xs text-gray-600 line-clamp-2">{v.question.question_text}</p>
                    </div>

                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getScoreColor(score)}`}>
                      {score.toFixed(0)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* VIDEO PLAYER + DETAILS */}
        <div className="lg:col-span-2 space-y-6">
          {detailsLoading && <DetailsSkeleton />}

          {!detailsLoading && selectedVideo && (
            <>
              {/* VIDEO PLAYER */}
              <div className="bg-white p-6 shadow border rounded-xl">
                <h3 className="text-lg font-semibold mb-4">Video</h3>

                {selectedVideo.video_file ? (
                  <VideoPlayer
                    src={`${process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:8000"}${
                      selectedVideo.video_file
                    }`}
                    className="w-full aspect-video"
                  />
                ) : (
                  <p className="text-gray-500 italic">No video uploaded.</p>
                )}
              </div>

              {/* QUESTION DETAILS */}
              <div className="bg-white p-6 shadow border rounded-xl">
                <h3 className="text-lg font-semibold mb-4">Question Details</h3>

                <p className="text-gray-900">{selectedVideo.question.question_text}</p>

                <div className="mt-3 flex items-center space-x-3">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                    {selectedVideo.question.question_type}
                  </span>

                  <span className={`px-2 py-1 text-xs rounded ${getSentimentColor(selectedVideo.sentiment)}`}>
                    {typeof selectedVideo.sentiment === "number"
                      ? selectedVideo.sentiment.toFixed(0)
                      : selectedVideo.sentiment || "N/A"}
                  </span>
                </div>
              </div>

              {/* TRANSCRIPT */}
              <div className="bg-white p-6 shadow border rounded-xl">
                <h3 className="text-lg font-semibold mb-4">Transcript</h3>
                <div className="bg-gray-50 p-4 rounded-lg max-h-60 overflow-y-auto text-gray-800 whitespace-pre-wrap">
                  {selectedVideo.transcript || "No transcript available."}
                </div>
              </div>

              {/* AI ANALYSIS */}
              <div className="bg-white p-6 shadow border rounded-xl">
                <h3 className="text-lg font-semibold mb-4">AI Analysis</h3>
                <div className="bg-gray-50 p-4 rounded-lg text-gray-800 whitespace-pre-wrap space-y-3">
                  {selectedVideo.ai_assessment?.trim()
                    ? selectedVideo.ai_assessment
                    : "AI analysis not available for this response."}
                </div>
              </div>

              {/* AI SCORING BREAKDOWN */}
              <div className="bg-white p-6 shadow border rounded-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">AI Scoring Breakdown</h3>
                  <button
                    type="button"
                    onClick={() => setShowAIScoring((prev) => !prev)}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {showAIScoring ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  AI signals are advisory and do not replace HR judgment.
                </p>
                {showAIScoring && (
                  <div className="mt-4 space-y-4">
                    {(() => {
                      const scoring = selectedVideo.ai_scoring || {};
                      const metrics = [
                        { key: "content_relevance_score", label: "Content Relevance", emphasize: true },
                        { key: "speech_clarity_score", label: "Speech Clarity", emphasize: false },
                        { key: "confidence_score", label: "Confidence", emphasize: false },
                        { key: "sentiment_score", label: "Sentiment", emphasize: false },
                        { key: "overall_score", label: "Overall Score", emphasize: false },
                      ] as const;
                      const hasScores = metrics.some((metric) => typeof scoring[metric.key] === "number");
                      if (!hasScores) {
                        return <p className="text-sm text-gray-500">AI scoring details not available.</p>;
                      }
                      return metrics.map((metric) => {
                        const value = scoring[metric.key];
                        const displayValue =
                          typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
                        return (
                          <div key={metric.key} className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className={metric.emphasize ? "font-semibold text-gray-900" : "text-gray-700"}>
                                {metric.label}
                              </span>
                              <span className="text-gray-700">
                                {displayValue === null ? "N/A" : `${displayValue}/100`}
                              </span>
                            </div>
                            {renderScoreBar(displayValue, metric.emphasize)}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              {/* SCORING */}
              <div className="bg-white p-6 shadow border rounded-xl space-y-4">
                <h3 className="text-lg font-semibold">Scoring</h3>

                {/* AUTO SCORE */}
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">AI Score</span>
                    <span
                      className={`px-3 py-1 rounded text-lg font-semibold ${getScoreColor(selectedVideo.ai_score)}`}
                    >
                      {selectedVideo.ai_score.toFixed(1)}
                    </span>
                  </div>
                </div>

              {/* OVERRIDE */}
              {!selectedVideo.hr_override_score ? (
                  (() => {
                    const overrideScoreInput = overrideForm.score.trim();
                    const overrideScoreValue = overrideScoreInput === "" ? null : Number(overrideScoreInput);
                    const overrideScoreValid =
                      overrideScoreValue !== null &&
                      Number.isFinite(overrideScoreValue) &&
                      overrideScoreValue >= 0 &&
                      overrideScoreValue <= 100;
                    const overrideDelta =
                      overrideScoreValue !== null && typeof selectedVideo.ai_score === "number"
                        ? Math.abs(overrideScoreValue - selectedVideo.ai_score)
                        : null;
                    const overrideNeedsComment = overrideDelta !== null && overrideDelta > 20;
                    const overrideCommentValid =
                      !overrideNeedsComment || overrideForm.comments.trim().length >= 20;
                    const canSaveOverride = !submitting && overrideScoreValid && overrideCommentValid;

                    return (
                      <div className="space-y-4">
                        <input
                          type="number"
                          placeholder="Override score (0-100)"
                          className="w-full border p-2 rounded-lg"
                          value={overrideForm.score}
                          onChange={(e) =>
                            setOverrideForm({
                              ...overrideForm,
                              score: e.target.value,
                            })
                          }
                        />

                        <div>
                          <textarea
                            placeholder="HR comments (required if delta > 20)"
                            className="w-full border p-2 rounded-lg"
                            rows={3}
                            value={overrideForm.comments}
                            onChange={(e) =>
                              setOverrideForm({
                                ...overrideForm,
                                comments: e.target.value,
                              })
                            }
                          />
                          {overrideNeedsComment && !overrideCommentValid && (
                            <p className="text-xs text-red-600 mt-2">
                              Comment must be at least 20 characters when override delta exceeds 20 points.
                            </p>
                          )}
                        </div>

                        <button
                          onClick={handleOverrideSubmit}
                          disabled={!canSaveOverride}
                          className={`w-full text-white py-2 rounded-lg ${
                            canSaveOverride ? "bg-purple-600 hover:bg-purple-700" : "bg-gray-300 cursor-not-allowed"
                          }`}
                        >
                          {submitting ? "Saving..." : "Save Override"}
                        </button>
                      </div>
                    );
                  })()
              ) : (
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <p className="font-semibold text-purple-800">
                      Override Score: {selectedVideo.hr_override_score.toFixed(1)}
                    </p>
                    {selectedVideo.hr_comments && (
                      <p className="mt-2 text-sm text-gray-700">Comments: {selectedVideo.hr_comments}</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Final HR Decision Panel */}
      <div className="bg-amber-50 p-6 shadow rounded-xl border-2 border-amber-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Final Interview Decision (All Questions)</h3>
          {isDecisionFinal && <span className="text-xs text-gray-500">Decision finalized</span>}
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-amber-700">
          <span aria-hidden="true">🔒</span>
          <span>This decision applies to the entire interview.</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <p className="text-sm text-gray-600">AI Recommendation</p>
            <span className={`inline-flex mt-2 px-2 py-1 rounded-full text-xs font-semibold ${recommendationClass}`}>
              {recommendationLabel}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-600">Current HR Decision</p>
            <span className={`inline-flex mt-2 px-2 py-1 rounded-full text-xs font-semibold ${decisionClass}`}>
              {decisionLabel}
            </span>
            {decisionReason && <p className="mt-2 text-xs text-gray-600">Reason: {decisionReason}</p>}
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          Decisions affect applicant status and reapplication rules.
        </p>

        <div className="mt-6 space-y-6">
          <div>
            <p className="text-sm font-medium text-gray-700">Decision</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {[
                {
                  value: "hire",
                  label: "Hire",
                  active: "border-green-600 bg-green-50 text-green-800",
                  idle: "border-gray-200 text-gray-700 hover:border-green-300",
                },
                {
                  value: "reject",
                  label: "Reject",
                  active: "border-red-600 bg-red-50 text-red-800",
                  idle: "border-gray-200 text-gray-700 hover:border-red-300",
                },
                {
                  value: "hold",
                  label: "Hold",
                  active: "border-amber-600 bg-amber-50 text-amber-800",
                  idle: "border-gray-200 text-gray-700 hover:border-amber-300",
                },
              ].map((option) => {
                const selected = decisionType === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${
                      selected ? option.active : option.idle
                    } ${isDecisionLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <input
                      type="radio"
                      name="hr-decision"
                      className="sr-only"
                      value={option.value}
                      checked={selected}
                      onChange={() => {
                        if (isDecisionLocked) return;
                        setDecisionType(option.value as "hire" | "reject" | "hold");
                        setDecisionError("");
                      }}
                      disabled={isDecisionLocked}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
            {!decisionType && !isDecisionLocked && (
              <p className="mt-2 text-xs text-gray-500">Select a decision to continue.</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border bg-gray-50">
              <p className="text-xs text-gray-500">AI Aggregate Score</p>
              <p className="text-lg font-semibold text-gray-900">{aiOverallDisplay}</p>
            </div>
            <div className="p-4 rounded-lg border bg-gray-50">
              <p className="text-xs text-gray-500">HR-Adjusted Score</p>
              <p className="text-lg font-semibold text-gray-900">{hrAdjustedDisplay}</p>
              <p className="text-xs text-gray-500 mt-2">Derived from per-question overrides.</p>
            </div>
          </div>

          {decisionType === "hold" && (
            <div>
              <label className="text-sm font-medium text-gray-700" htmlFor="hold-until">
                Hold until
              </label>
              <input
                id="hold-until"
                type="datetime-local"
                className="mt-2 w-full border rounded-lg p-2 text-sm"
                value={holdUntil}
                onChange={(e) => {
                  setHoldUntil(e.target.value);
                  setDecisionError("");
                }}
                disabled={isDecisionLocked}
              />
              {!holdValid && (
                <p className="text-xs text-red-600 mt-2">Hold follow-up date is required.</p>
              )}
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700" htmlFor="decision-notes">
              HR Comment {commentRequired ? "(required)" : "(optional)"}
            </label>
            <textarea
              id="decision-notes"
              className="mt-2 w-full border rounded-lg p-2 text-sm"
              rows={4}
              placeholder="Explain the final decision for audit clarity."
              value={decisionNotes}
              onChange={(e) => {
                setDecisionNotes(e.target.value);
                setDecisionError("");
              }}
              disabled={isDecisionLocked}
            />
            {commentRequired && !commentValid && (
              <p className="text-xs text-red-600 mt-2">Comment is required for Hold decisions.</p>
            )}
          </div>

          <p className="text-xs text-gray-500">
            AI signals are advisory and do not replace HR judgment.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={openDecisionModal}
              disabled={!canFinalize}
              className={`px-4 py-2 rounded-lg text-white font-semibold ${
                canFinalize ? "bg-purple-600 hover:bg-purple-700" : "bg-gray-300 cursor-not-allowed"
              }`}
            >
              {submitting ? "Saving..." : "Finalize HR Decision"}
            </button>
            {isDecisionLocked && (
              <p className="text-xs text-gray-500">
                Decision is locked. Reopen review to make changes.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* FINAL DECISION MODAL */}
      {showDecisionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow max-w-md w-full">
            <h3 className="text-xl font-bold">Confirm {decisionTypeLabel}</h3>

            <p className="text-gray-600 mt-2">
              You are about to finalize this interview decision. This action affects applicant status and reapplication rules.
            </p>

            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <div className="flex items-center justify-between">
                <span>AI Aggregate Score</span>
                <span className="font-semibold">{aiOverallDisplay}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>HR-Adjusted Score</span>
                <span className="font-semibold">{hrAdjustedDisplay}</span>
              </div>
              {decisionType === "hold" && (
                <div className="flex items-center justify-between">
                  <span>Hold until</span>
                  <span className="font-semibold">{holdUntil ? holdUntil.replace("T", " ") : "—"}</span>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500">HR Comment</p>
                <p className="mt-1 text-sm text-gray-800">{trimmedComment || "None provided"}</p>
              </div>
            </div>
            {decisionError && <p className="mt-3 text-xs text-red-600">{decisionError}</p>}

            <div className="mt-4 flex space-x-3">
              <button
                onClick={() => {
                  setShowDecisionModal(false);
                  setDecisionError("");
                }}
                className="flex-1 bg-gray-200 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalDecision}
                className={`flex-1 text-white py-2 rounded-lg ${
                  decisionType === "hire"
                    ? "bg-green-600 hover:bg-green-700"
                    : decisionType === "reject"
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

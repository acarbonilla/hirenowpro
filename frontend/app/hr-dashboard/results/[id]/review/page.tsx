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
  passed: boolean;
  recommendation?: string;
  created_at: string;
  video_responses: VideoResponse[];
}

// COMPONENT --------------------------------------------------------------

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams();

  // Handle Next.js quirk: params.id can be string | string[]
  const resultId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [overrideForm, setOverrideForm] = useState({
    score: "",
    comments: "",
  });

  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionType, setDecisionType] = useState<"hired" | "rejected" | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");

  // FETCH DATA --------------------------------------------------------------

  useEffect(() => {
    if (!resultId) {
      setError("Invalid result ID");
      setLoading(false);
      return;
    }
    fetchReviewData();
  }, [resultId]);

  const fetchReviewData = async () => {
    setLoading(true);

    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await axios.get(`${API_BASE_URL}/results/${resultId}/full-review/`, { headers, timeout: 20000 });

      const data: ReviewData = response.data;

      setReviewData(data);

      // pick first video safely
      const videos = data.video_responses || [];
      setSelectedVideo(videos.length ? videos[0] : null);
    } catch (err: any) {
      if (err.response?.status === 401) {
        router.push("/hr-login");
        return;
      }

      setError(err.response?.data?.detail || "Failed to load review data");
    } finally {
      setLoading(false);
    }
  };

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

    setSubmitting(true);

    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      await axios.post(
        `${API_BASE_URL}/results/${resultId}/override-score/`,
        {
          video_response_id: selectedVideo.id,
          override_score: score,
          comments: overrideForm.comments || "",
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

  // FINAL DECISION --------------------------------------------------------------

  const handleFinalDecision = async () => {
    if (!decisionType) return;

    setSubmitting(true);

    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      await axios.post(
        `${API_BASE_URL}/results/${resultId}/final-decision/`,
        {
          decision: decisionType,
          notes: decisionNotes,
        },
        { headers }
      );

      alert(decisionType === "hired" ? "Applicant marked as HIRED" : "Applicant marked as REJECTED");

      router.push("/hr-dashboard/interviews");
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to save decision");
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
          Back to Results
        </Link>
      </div>
    );
  }

  // UI START --------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <Link href="/hr-dashboard/interviews" className="text-purple-600 hover:text-purple-800 text-sm">
            ← Back
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Interview Review</h1>
          <p className="text-gray-600">Reviewing {reviewData.applicant.full_name}</p>
        </div>

        <button onClick={() => window.print()} className="px-4 py-2 bg-gray-600 text-white rounded-lg">
          Print
        </button>
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

      {/* VIDEO LIST + PLAYER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* VIDEO LIST */}
        <div className="bg-white p-6 rounded-xl shadow border">
          <h3 className="text-lg font-semibold mb-4">Questions ({reviewData.video_responses.length})</h3>

          <div className="space-y-2">
            {reviewData.video_responses.map((v, i) => {
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
          {selectedVideo && (
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

                    <textarea
                      placeholder="HR comments (optional)"
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

                    <button
                      onClick={handleOverrideSubmit}
                      disabled={submitting}
                      className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700"
                    >
                      {submitting ? "Saving..." : "Save Override"}
                    </button>
                  </div>
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

      {/* FINAL DECISION MODAL */}
      {showDecisionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow max-w-md w-full">
            <h3 className="text-xl font-bold">Confirm {decisionType === "hired" ? "Hire" : "Reject"}</h3>

            <p className="text-gray-600 mt-2">
              {decisionType === "hired"
                ? `Mark ${reviewData.applicant.full_name} as HIRED`
                : `Reject ${reviewData.applicant.full_name}`}
            </p>

            <textarea
              className="w-full mt-4 border p-2 rounded-lg"
              rows={3}
              placeholder="Decision notes (optional)"
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
            />

            <div className="mt-4 flex space-x-3">
              <button onClick={() => setShowDecisionModal(false)} className="flex-1 bg-gray-200 py-2 rounded-lg">
                Cancel
              </button>
              <button
                onClick={handleFinalDecision}
                className={`flex-1 text-white py-2 rounded-lg ${
                  decisionType === "hired" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
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

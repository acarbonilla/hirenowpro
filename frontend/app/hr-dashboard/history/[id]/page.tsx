"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { getHRToken } from "@/lib/auth-hr";
import VideoPlayer from "@/components/VideoPlayer";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface VideoResponse {
  id: number;
  question_text: string;
  question_type: string;
  video_file_path: string;
  transcript: string;
  ai_score: number;
  ai_analysis_summary: string;
  sentiment: number | string;
  hr_override_score?: number;
  hr_comments?: string;
  hr_reviewed_at?: string;
  status: string;
}

interface ApplicantDetail {
  id: number;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  application_source: string;
  status: string;
  application_date: string;
  reapplication_date?: string;
  latitude?: string;
  longitude?: string;
  distance_from_office?: string;
  interview?: {
    id: number;
    position: string;
    position_code: string;
    status: string;
    video_count: number;
    created_at: string;
    submission_date?: string;
    authenticity_flag: boolean;
    authenticity_status?: string;
  };
  result?: {
    id: number;
    final_score: number;
    passed: boolean;
    result_date: string;
    final_decision?: string;
    final_decision_date?: string;
    final_decision_by?: string;
    final_decision_notes?: string;
    hr_portal_displayed: boolean;
    email_notification_sent: boolean;
  };
  video_responses: VideoResponse[];
  processing_history: Array<{
    id: number;
    status: string;
    added_at: string;
    started_at?: string;
    completed_at?: string;
    error_message?: string;
  }>;
}

export default function ApplicantDetailHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const applicantId = params.id as string;

  const [applicant, setApplicant] = useState<ApplicantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<VideoResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "videos" | "processing">("overview");

  useEffect(() => {
    if (applicantId) {
      fetchApplicantDetail();
    }
  }, [applicantId]);

  const fetchApplicantDetail = async () => {
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await axios.get(`${API_BASE_URL}/applicants/${applicantId}/full-history/`, { headers });
      setApplicant(response.data);

      if (response.data.video_responses && response.data.video_responses.length > 0) {
        setSelectedVideo(response.data.video_responses[0]);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load applicant details");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors: { [key: string]: string } = {
      pending: "bg-yellow-100 text-yellow-800",
      in_review: "bg-blue-100 text-blue-800",
      passed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      hired: "bg-purple-100 text-purple-800",
      withdrawn: "bg-gray-100 text-gray-800",
    };
    return (
      <span
        className={`px-3 py-1 text-sm font-semibold rounded-full ${statusColors[status] || "bg-gray-100 text-gray-800"
          }`}
      >
        {status.replace("_", " ").toUpperCase()}
      </span>
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (error || !applicant) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 text-lg">{error || "Applicant not found"}</p>
        <Link href="/hr-dashboard/history" className="text-orange-600 hover:text-orange-800 mt-4 inline-block">
          ← Back to Interview Records
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/hr-dashboard/history" className="text-orange-600 hover:text-orange-800 text-sm mb-2 inline-block">
          ← Back to Interview Records
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{applicant.full_name}</h1>
            <p className="text-gray-600 mt-1">Complete applicant history and tracking</p>
          </div>
          {getStatusBadge(applicant.status)}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "overview"
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("videos")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "videos"
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
          >
            Video Interview ({applicant.video_responses.length})
          </button>
          <button
            onClick={() => setActiveTab("processing")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "processing"
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
          >
            Processing History
          </button>
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Personal Information */}
          <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <span>👤</span>
              <span>Personal Information</span>
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Full Name</p>
                <p className="text-base font-medium text-gray-900">{applicant.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="text-base font-medium text-gray-900">{applicant.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Phone</p>
                <p className="text-base font-medium text-gray-900">{applicant.phone}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Application Source</p>
                <p className="text-base font-medium text-gray-900">
                  {applicant.application_source === "online" ? "🌐 Online" : "🚶 Walk-in"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Application Date</p>
                <p className="text-base font-medium text-gray-900">
                  {new Date(applicant.application_date).toLocaleString()}
                </p>
              </div>
              {applicant.reapplication_date && (
                <div>
                  <p className="text-sm text-gray-500">Can Reapply After</p>
                  <p className="text-base font-medium text-gray-900">
                    {new Date(applicant.reapplication_date).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Interview Information */}
          {applicant.interview && (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                <span>🎥</span>
                <span>Interview Information</span>
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Position</p>
                  <p className="text-base font-medium text-gray-900">{applicant.interview.position}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Interview Status</p>
                  <p className="text-base font-medium text-gray-900">{applicant.interview.status}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Video Responses</p>
                  <p className="text-base font-medium text-gray-900">{applicant.interview.video_count} videos</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Created At</p>
                  <p className="text-base font-medium text-gray-900">
                    {new Date(applicant.interview.created_at).toLocaleString()}
                  </p>
                </div>
                {applicant.interview.submission_date && (
                  <div>
                    <p className="text-sm text-gray-500">Submitted At</p>
                    <p className="text-base font-medium text-gray-900">
                      {new Date(applicant.interview.submission_date).toLocaleString()}
                    </p>
                  </div>
                )}
                {applicant.interview.authenticity_flag && (
                  <div>
                    <p className="text-sm text-gray-500">Authenticity Status</p>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                      ⚠️ {applicant.interview.authenticity_status || "Flagged"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Result Information */}
          {applicant.result && (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                <span>📊</span>
                <span>Result Information</span>
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Final Score</p>
                  <p className={`text-3xl font-bold ${getScoreColor(applicant.result.final_score)}`}>
                    {applicant.result.final_score.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">AI Recommendation</p>
                  <span
                    className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${applicant.result.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}
                  >
                    {applicant.result.passed ? "PASS" : "FAIL"}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Result Date</p>
                  <p className="text-base font-medium text-gray-900">
                    {new Date(applicant.result.result_date).toLocaleString()}
                  </p>
                </div>
                {applicant.result.final_decision && (
                  <>
                    <div>
                      <p className="text-sm text-gray-500">Final Decision</p>
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${applicant.result.final_decision === "hired"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-red-100 text-red-800"
                          }`}
                      >
                        {applicant.result.final_decision.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Decided By</p>
                      <p className="text-base font-medium text-gray-900">
                        {applicant.result.final_decision_by || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Decision Date</p>
                      <p className="text-base font-medium text-gray-900">
                        {applicant.result.final_decision_date
                          ? new Date(applicant.result.final_decision_date).toLocaleString()
                          : "N/A"}
                      </p>
                    </div>
                    {applicant.result.final_decision_notes && (
                      <div>
                        <p className="text-sm text-gray-500">Decision Notes</p>
                        <p className="text-base text-gray-900 bg-gray-50 p-3 rounded-lg border border-gray-200">
                          {applicant.result.final_decision_notes}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Location Information */}
          {(applicant.latitude || applicant.distance_from_office) && (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                <span>📍</span>
                <span>Location Information</span>
              </h2>
              <div className="space-y-3">
                {applicant.latitude && applicant.longitude && (
                  <div>
                    <p className="text-sm text-gray-500">Coordinates</p>
                    <p className="text-base font-medium text-gray-900">
                      {parseFloat(applicant.latitude).toFixed(6)}, {parseFloat(applicant.longitude).toFixed(6)}
                    </p>
                  </div>
                )}
                {applicant.distance_from_office && (
                  <div>
                    <p className="text-sm text-gray-500">Distance from Office</p>
                    <p className="text-base font-medium text-gray-900">
                      {(parseFloat(applicant.distance_from_office) / 1000).toFixed(2)} km
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Videos Tab */}
      {activeTab === "videos" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video List */}
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Interview Questions</h2>
            {applicant.video_responses.map((video, index) => (
              <button
                key={video.id}
                onClick={() => setSelectedVideo(video)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${selectedVideo?.id === video.id
                    ? "border-orange-500 bg-orange-50"
                    : "border-gray-200 hover:border-orange-300 bg-white"
                  }`}
              >
                <p className="font-medium text-gray-900">Question {index + 1}</p>
                <p className="text-sm text-gray-600 line-clamp-2 mt-1">{video.question_text}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-500">{video.question_type}</span>
                  <span className={`text-sm font-semibold ${getScoreColor(video.ai_score || 0)}`}>
                    {video.ai_score !== null && video.ai_score !== undefined ? `${video.ai_score.toFixed(0)}%` : "N/A"}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Video Player and Details */}
          {selectedVideo && (
            <div className="lg:col-span-2 space-y-6">
              {/* Video */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Video Response</h3>
                <VideoPlayer src={`http://localhost:8000${selectedVideo.video_file_path}`} />
              </div>

              {/* Question */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Question</h3>
                <p className="text-gray-800">{selectedVideo.question_text}</p>
              </div>

              {/* Transcript */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Transcript</h3>
                <p className="text-gray-800 whitespace-pre-wrap">
                  {selectedVideo.transcript || "No transcript available"}
                </p>
              </div>

              {/* AI Analysis */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">AI Analysis</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-500">Score</p>
                    <p className={`text-2xl font-bold ${getScoreColor(selectedVideo.ai_score || 0)}`}>
                      {selectedVideo.ai_score !== null && selectedVideo.ai_score !== undefined ? `${selectedVideo.ai_score.toFixed(1)}%` : "N/A"}
                    </p>
                  </div>
                  {selectedVideo.ai_analysis_summary && (
                    <div>
                      <p className="text-sm text-gray-500 mb-2">Analysis Summary</p>
                      <p className="text-gray-800 bg-gray-50 p-3 rounded-lg border border-gray-200">
                        {selectedVideo.ai_analysis_summary}
                      </p>
                    </div>
                  )}
                  {selectedVideo.hr_override_score && (
                    <div>
                      <p className="text-sm text-gray-500">HR Override Score</p>
                      <p className="text-xl font-bold text-purple-600">{selectedVideo.hr_override_score}%</p>
                    </div>
                  )}
                  {selectedVideo.hr_comments && (
                    <div>
                      <p className="text-sm text-gray-500 mb-2">HR Comments</p>
                      <p className="text-gray-800 bg-purple-50 p-3 rounded-lg border border-purple-200">
                        {selectedVideo.hr_comments}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Processing History Tab */}
      {activeTab === "processing" && (
        <div className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Processing Queue History</h2>
            <p className="text-gray-600 text-sm mt-1">Timeline of processing events</p>
          </div>
          {applicant.processing_history && applicant.processing_history.length > 0 ? (
            <div className="p-6">
              <div className="space-y-4">
                {applicant.processing_history.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex-shrink-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${entry.status === "completed"
                            ? "bg-green-100 text-green-600"
                            : entry.status === "failed"
                              ? "bg-red-100 text-red-600"
                              : entry.status === "processing"
                                ? "bg-blue-100 text-blue-600"
                                : "bg-yellow-100 text-yellow-600"
                          }`}
                      >
                        {entry.status === "completed" ? "✓" : entry.status === "failed" ? "✗" : "●"}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-gray-900">{entry.status.toUpperCase()}</p>
                        <p className="text-sm text-gray-500">{new Date(entry.added_at).toLocaleString()}</p>
                      </div>
                      {entry.started_at && (
                        <p className="text-sm text-gray-600 mt-1">
                          Started: {new Date(entry.started_at).toLocaleString()}
                        </p>
                      )}
                      {entry.completed_at && (
                        <p className="text-sm text-gray-600">
                          Completed: {new Date(entry.completed_at).toLocaleString()}
                        </p>
                      )}
                      {entry.error_message && (
                        <p className="text-sm text-red-600 mt-2 bg-red-50 p-2 rounded border border-red-200">
                          Error: {entry.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-gray-500">No processing history available</div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { getHRToken } from "@/lib/auth-hr";
import { API_BASE_URL } from "@/lib/apiBase";
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DATE_FILTERS = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];
const DECISION_FILTERS = [
  { label: "All Decisions", value: undefined },
  { label: "Pending HR Review", value: "pending" },
  { label: "Passed", value: "hired" },
  { label: "Failed", value: "rejected" },
];
const STATUS_FILTERS = [
  { label: "All Statuses", value: undefined },
  { label: "Processing", value: "processing" },
  { label: "Submitted", value: "submitted" },
];

interface ResultSummary {
  id: number;
  applicant_display_name?: string;
  created_at?: string;
  score?: number;
  passed?: boolean;
  interview_status?: string;
  position_code?: string | null;
  hr_decision?: "hire" | "reject" | "hold" | null;
  hold_until?: string | null;
  final_decision?: "hired" | "rejected" | null;
}

interface Thresholds {
  passing: number;
  review: number;
}

export default function HRResultsPage() {
  const router = useRouter();
  const [results, setResults] = useState<ResultSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [decisionFilter, setDecisionFilter] = useState<string | undefined>("pending");
  const [includeOlder, setIncludeOlder] = useState(false);
  const [thresholds, setThresholds] = useState<Thresholds>({ passing: 70, review: 50 });
  const [totalCount, setTotalCount] = useState(0);

  const normalize = (data: any) => {
    if (Array.isArray(data)) return data;
    if (data?.results) return data.results;
    return [];
  };

  const fetchResults = async (signal: AbortSignal) => {
    setLoading(true);

    const token = getHRToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const res = await axios.get(`${API_BASE_URL}/api/hr/results/summary/`, {
        headers,
        params: {
          page,
          page_size: pageSize,
          date_filter: dateFilter,
          status: statusFilter,
          final_decision: decisionFilter,
          include_older: includeOlder ? "true" : undefined,
        },
        signal,
      });

      // Do not add detail fields here - list must remain lightweight.
      const list = normalize(res.data);
      setResults(list);
      setTotalCount(res.data?.count ?? list.length);

      const incomingThresholds = res.data?.thresholds;
      if (incomingThresholds) {
        const passing = Number(incomingThresholds.passing);
        const review = Number(incomingThresholds.review);
        if (!Number.isNaN(passing) && !Number.isNaN(review)) {
          setThresholds({ passing, review });
        }
      }
    } catch (err: any) {
      if (err.name === "CanceledError" || err.code === "ERR_CANCELED") return;
      console.error("Error fetching interviews:", err);
      if (err.response?.status === 401) {
        setError("Authentication required. Redirecting...");
        setTimeout(() => router.push("/hr-login"), 1500);
      } else if (err.response?.status === 403) {
        setError("Access denied.");
      } else {
        setError("Unable to load interview reviews.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchResults(controller.signal);
    return () => controller.abort();
  }, [page, pageSize, dateFilter, statusFilter, decisionFilter, includeOlder]);

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize));

  const handlePageChange = (newPage: number) => {
    if (loading) return;
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-gray-100 p-8">
        <div className="mb-4 h-8 w-48 bg-gray-200 animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-md border border-gray-200 p-6 animate-pulse space-y-3">
              <div className="h-5 bg-gray-200 rounded w-2/3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
              <div className="h-10 bg-gray-200 rounded w-full"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="flex items-center justify-center h-64 text-red-600 font-semibold">{error}</div>;
  }

  return (
    <div className="w-full min-h-screen bg-gray-100 p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Interview Review</h1>
        <p className="text-sm text-gray-600 mt-2">
          {includeOlder ? "Including older interviews." : "Showing interviews from the last 30 days."}
        </p>
        <p className="text-xs text-gray-500">Older interviews are available in Interview Records.</p>
      </div>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {DECISION_FILTERS.map((filter) => {
              const active = decisionFilter === filter.value;
              return (
                <button
                  key={filter.label}
                  onClick={() => {
                    setDecisionFilter(filter.value);
                    setPage(1);
                  }}
                  disabled={loading}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    active
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  } ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((filter) => {
              const active = statusFilter === filter.value;
              return (
                <button
                  key={filter.label}
                  onClick={() => {
                    setStatusFilter(filter.value);
                    setPage(1);
                  }}
                  disabled={loading}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    active
                      ? "bg-slate-700 text-white"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  } ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeOlder}
              onChange={(event) => {
                setIncludeOlder(event.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Include older interviews
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {DATE_FILTERS.map((filter) => {
            const active = dateFilter === filter.value;
            return (
              <button
                key={filter.value}
                onClick={() => {
                  setDateFilter(filter.value as typeof dateFilter);
                  setPage(1);
                }}
                disabled={loading}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  active
                    ? "bg-orange-600 text-white"
                    : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                } ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700">Page size:</label>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            disabled={loading}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="text-center text-gray-500 py-10 text-lg">
          {decisionFilter === "pending" ? (
            <div className="space-y-2">
              <p>No interviews are currently ready for HR review.</p>
              <p className="text-sm text-gray-400">
                Retake interviews will appear here once submitted and AI analysis is complete.
              </p>
              <p className="text-xs text-gray-400">
                Interviews in progress or awaiting AI analysis are not shown here.
              </p>
            </div>
          ) : (
            "No interview reviews found for this filter."
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.map((item) => {
              const displayName = (item.applicant_display_name && item.applicant_display_name.trim()) || null;
              const title = displayName || (item.id ? `Interview #${item.id}` : "Applicant Unavailable");
              const hrDecision = item.hr_decision ?? null;
              const finalDecision = item.final_decision ?? null;
              const effectiveDecision =
                hrDecision === "hire" || hrDecision === "reject" || hrDecision === "hold"
                  ? hrDecision
                  : finalDecision === "hired" || finalDecision === "rejected"
                    ? finalDecision === "hired"
                      ? "hire"
                      : "reject"
                    : null;
              const holdUntil = item.hold_until ? new Date(item.hold_until) : null;
              const holdExpired = holdUntil ? holdUntil.getTime() < Date.now() : false;
              const holdDays = holdUntil
                ? Math.ceil((holdUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
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
              const rawScore = typeof item.score === "number" ? item.score : Number(item.score);
              const scoreValue = Number.isFinite(rawScore) ? rawScore : 0;
              const aiPassed = scoreValue >= thresholds.passing;
              const aiRecommendation = scoreValue >= thresholds.passing ? "Pass" : scoreValue >= thresholds.review ? "Review" : "Fail";
              const showPendingNote = !effectiveDecision && aiPassed;
              const holdMeta =
                effectiveDecision === "hold"
                  ? holdExpired
                    ? "Hold expired"
                    : holdDays !== null
                      ? `${holdDays} day${holdDays === 1 ? "" : "s"} remaining`
                      : "Follow-up scheduled"
                  : null;

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl shadow-md border p-6 hover:shadow-lg transition-all ${
                    holdExpired ? "border-amber-400 bg-amber-50/40" : "border-gray-200"
                  }`}
                >
                  <h2 className="text-lg font-semibold text-gray-800">{title}</h2>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">HR Decision:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${decisionClass}`}>{decisionLabel}</span>
                      {holdMeta && (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                          {holdMeta}
                        </span>
                      )}
                    </div>
                    {showPendingNote && (
                      <p className="text-xs text-yellow-700">AI score passed the threshold. Waiting for HR final review.</p>
                    )}
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">AI Score:</span> {scoreValue.toFixed(1)} / 100 (Threshold: {thresholds.passing.toFixed(0)})
                      <span className={`ml-2 text-xs font-semibold ${aiPassed ? "text-green-700" : "text-red-700"}`}>{aiPassed ? "Meets threshold" : "Below threshold"}</span>
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">AI Recommendation:</span> {aiRecommendation}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Interview Status:</span> {item.interview_status ?? "N/A"}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Position:</span> {item.position_code ?? "N/A"}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Created:</span> {item.created_at ? new Date(item.created_at).toLocaleString() : "N/A"}
                    </p>
                  </div>

                  <button
                    onClick={() => router.push(`/hr-dashboard/results/${item.id}/review`)}
                    className="mt-5 w-full py-2 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 transition-all"
                  >
                    View Details
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-3">
            <div className="text-sm text-gray-700">
              Page {page} of {totalPages}  {totalCount} review{totalCount === 1 ? "" : "s"}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={loading || page <= 1}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={loading || page >= totalPages}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

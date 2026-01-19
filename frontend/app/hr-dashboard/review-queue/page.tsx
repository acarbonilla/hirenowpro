"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { getHRToken } from "@/lib/auth-hr";
import { API_BASE_URL } from "@/lib/apiBase";

interface ReviewItem {
  id: number;
  applicant_display_name?: string;
  created_at?: string;
  score?: number;
  position_code?: string | null;
  hr_decision?: "hire" | "reject" | "hold" | "on_hold" | null;
}

interface ReviewStats {
  pending_count?: number;
  urgent_count?: number;
  reviewed_today_count?: number;
}

interface ReviewResponse {
  count?: number;
  results?: ReviewItem[];
  stats?: ReviewStats;
}

type ViewMode = "pending" | "reviewed";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const getDaysWaiting = (createdAt?: string) => {
  if (!createdAt) return 0;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - created.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const formatPosition = (code?: string | null) => {
  if (!code) return "-";
  return code.replace(/_/g, " ").toUpperCase();
};

const getDecisionBadge = (decision?: "hire" | "reject" | "hold" | "on_hold" | null) => {
  if (!decision) {
    return { label: "Pending HR Review", classes: "bg-yellow-100 text-yellow-800" };
  }
  if (decision === "hire") {
    return { label: "Reviewed (Hire)", classes: "bg-green-100 text-green-800" };
  }
  if (decision === "reject") {
    return { label: "Reviewed (Reject)", classes: "bg-red-100 text-red-800" };
  }
  return { label: "On Hold", classes: "bg-blue-100 text-blue-800" };
};

export default function HRReviewQueuePage() {
  const [viewMode, setViewMode] = useState<ViewMode>("pending");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<ReviewStats>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const fetchQueue = async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await axios.get<ReviewResponse>(`${API_BASE_URL}/api/hr/results/summary/`, {
        headers,
        params: {
          page,
          page_size: pageSize,
          hr_decision: viewMode,
          include_stats: "true",
        },
        signal,
      });

      const list = Array.isArray(res.data?.results) ? res.data.results : [];
      setItems(list);
      setTotalCount(res.data?.count ?? list.length);
      setStats(res.data?.stats || {});
      setError("");
    } catch (err: any) {
      if (err.name === "CanceledError" || err.code === "ERR_CANCELED") return;
      console.error("Error fetching review queue:", err);
      if (err.response?.status === 401) {
        setError("Authentication required. Please log in again.");
      } else if (err.response?.status === 403) {
        setError("Access denied.");
      } else {
        setError("Failed to load review queue.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchQueue(controller.signal);
    return () => controller.abort();
  }, [viewMode, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [viewMode, pageSize]);

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize));
  const pendingCount = stats.pending_count ?? 0;
  const urgentCount = stats.urgent_count ?? 0;
  const reviewedTodayCount = stats.reviewed_today_count ?? 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h3 className="text-lg font-semibold text-red-900">Error Loading Review Queue</h3>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={() => {
              setError("");
              const controller = new AbortController();
              fetchQueue(controller.signal);
            }}
            className="w-full bg-orange-600 text-white py-2 px-4 rounded-lg hover:bg-orange-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">HR Review Queue</h1>
          <p className="text-gray-600 mt-1">Action-focused inbox for interview decisions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Pending Reviews</p>
          <p className="text-3xl font-bold text-orange-600 mt-2">{pendingCount}</p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-pink-50 border border-red-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Urgent (3+ days)</p>
          <p className="text-3xl font-bold text-red-600 mt-2">{urgentCount}</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Reviewed Today</p>
          <p className="text-3xl font-bold text-green-600 mt-2">{reviewedTodayCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-5 border border-gray-200">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setViewMode("pending")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              viewMode === "pending"
                ? "bg-orange-600 text-white"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            Pending Reviews
          </button>
          <button
            onClick={() => setViewMode("reviewed")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              viewMode === "reviewed"
                ? "bg-slate-700 text-white"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            Reviewed (Read-only)
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        {items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applicant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aggregate Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Waiting</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Review Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item) => {
                    const daysWaiting = getDaysWaiting(item.created_at);
                    const urgent = daysWaiting >= 3;
                    const scoreValue =
                      typeof item.score === "number" && Number.isFinite(item.score) ? item.score.toFixed(1) : "N/A";
                    const decisionBadge = getDecisionBadge(item.hr_decision);

                    return (
                      <tr
                        key={item.id}
                        className={urgent && viewMode === "pending" ? "bg-red-50/40" : "hover:bg-gray-50"}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {item.applicant_display_name || `Applicant #${item.id}`}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{formatPosition(item.position_code)}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{scoreValue}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <span className={urgent ? "text-red-600 font-semibold" : "text-gray-700"}>
                              {daysWaiting}d
                            </span>
                            {urgent && viewMode === "pending" && (
                              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                Urgent
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${decisionBadge.classes}`}>
                            {decisionBadge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <Link
                            href={`/hr-dashboard/results/${item.id}/review`}
                            className="inline-flex items-center px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-xs font-semibold"
                          >
                            Review Now
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="text-sm text-gray-700">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} items
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="pageSize" className="text-sm text-gray-700">
                    Per page:
                  </label>
                  <select
                    id="pageSize"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg"
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      disabled={page === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
            {viewMode === "pending" ? "No interviews require HR action." : "No reviewed interviews found."}
          </div>
        )}
      </div>
    </div>
  );
}

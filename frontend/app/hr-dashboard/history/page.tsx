"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getHRToken } from "@/lib/auth-hr";
import { api, isCancel } from "@/lib/apiClient";

interface ApplicantHistory {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  application_source: string;
  status: string;
  application_date: string;
  reapplication_date?: string;
  days_since_application: number;
  interview?: {
    id: number;
    position: string;
    position_code: string;
    status: string;
    video_count: number;
    created_at: string;
  };
  result?: {
    id: number;
    final_score: number;
    passed: boolean;
    result_date: string;
    final_decision?: string;
    final_decision_date?: string;
    final_decision_by?: string;
  };
}

interface PaginatedResponse {
  count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  results: ApplicantHistory[];
}

export default function ApplicantHistoryPage() {
  const router = useRouter();
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [scoreMin, setScoreMin] = useState("");
  const [scoreMax, setScoreMax] = useState("");
  const [hasInterview, setHasInterview] = useState("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [ordering, setOrdering] = useState("-application_date");

  // For filters panel
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [currentPage, pageSize, ordering]);

  // ====================================
  // SAFE FETCH WITH CACHING + ABORT
  // ====================================
  const fetchHistory = async (showLoading = true) => {
    const controller = new AbortController();
    if (showLoading) setLoading(true);

    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const params = new URLSearchParams();
      params.append("page", currentPage.toString());
      params.append("page_size", pageSize.toString());
      params.append("ordering", ordering);

      if (search) params.append("search", search);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (sourceFilter !== "all") params.append("application_source", sourceFilter);
      if (positionFilter !== "all") params.append("position", positionFilter);
      if (decisionFilter !== "all") params.append("final_decision", decisionFilter);
      if (dateFrom) params.append("date_from", dateFrom);
      if (dateTo) params.append("date_to", dateTo);
      if (scoreMin) params.append("score_min", scoreMin);
      if (scoreMax) params.append("score_max", scoreMax);
      if (hasInterview !== "all") params.append("has_interview", hasInterview);

      const url = `/applicants/history/?${params.toString()}`;

      const response = await api.get(url, {
        headers,
        timeout: 15000,
        signal: controller.signal,
      });

      setData(response.data);

      // cache for instant reload
      sessionStorage.setItem(
        "hr_history_cache",
        JSON.stringify({
          data: response.data,
          timestamp: Date.now(),
        })
      );
    } catch (err: any) {
      if (isCancel(err)) return;

      console.error("Fetch error:", err);
      setError(err.response?.data?.detail || "Failed to load applicant history");
    } finally {
      if (showLoading) setLoading(false);
    }

    return () => controller.abort();
  };

  // Load from cache instantly
  useEffect(() => {
    const cache = sessionStorage.getItem("hr_history_cache");
    if (cache) {
      try {
        const parsed = JSON.parse(cache);
        if (parsed?.data) {
          setData(parsed.data);
          setLoading(false);
          fetchHistory(false);
          return;
        }
      } catch {}
    }
    fetchHistory(true);
  }, [currentPage, pageSize, ordering]);

  const handleResetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setSourceFilter("all");
    setPositionFilter("all");
    setDecisionFilter("all");
    setDateFrom("");
    setDateTo("");
    setScoreMin("");
    setScoreMax("");
    setHasInterview("all");
    setCurrentPage(1);
    setTimeout(() => fetchHistory(), 100);
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
        className={`px-2 py-1 text-xs font-semibold rounded-full ${
          statusColors[status] || "bg-gray-100 text-gray-800"
        }`}
      >
        {status.replace("_", " ").toUpperCase()}
      </span>
    );
  };

  const getScoreBadge = (score: number, passed: boolean) => {
    const colorClass = passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${colorClass}`}>{score.toFixed(1)}%</span>;
  };

  const exportToCSV = () => {
    if (!data?.results) return;

    const headers = [
      "Name",
      "Email",
      "Phone",
      "Source",
      "Status",
      "Application Date",
      "Position",
      "Score",
      "Decision",
      "Days Since Application",
    ];
    const rows = data.results.map((applicant) => [
      applicant.full_name,
      applicant.email,
      applicant.phone,
      applicant.application_source,
      applicant.status,
      new Date(applicant.application_date).toLocaleDateString(),
      applicant.interview?.position || "N/A",
      applicant.result?.final_score?.toFixed(1) || "N/A",
      applicant.result?.final_decision || "Pending",
      applicant.days_since_application.toString(),
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `applicant-history-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchHistory(true);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-600"></div>
      </div>
    );
  }
  if (!loading && !data) {
    return <div className="text-center py-20 text-gray-500">No interview records available.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center space-x-3">
            <span className="text-4xl">📚</span>
            <span>Interview Records</span>
          </h1>
          <p className="text-gray-600 mt-1">Complete tracking and records of all applicants</p>
        </div>
        <button
          onClick={exportToCSV}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span>Export CSV</span>
        </button>
      </div>

      {/* Stats Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-600">Total Applicants</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{data.count}</p>
          </div>
          <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-600">Current Page</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {data.current_page}/{data.total_pages}
            </p>
          </div>
          <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-600">Showing</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{data.results.length}</p>
          </div>
          <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-600">Per Page</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{data.page_size}</p>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          {/* Search Bar */}
          <div className="flex space-x-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              {showFilters ? "Hide" : "Show"} Filters
            </button>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="in_review">In Review</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                  <option value="hired">Hired</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All Sources</option>
                  <option value="online">Online</option>
                  <option value="walk_in">Walk-in</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Decision</label>
                <select
                  value={decisionFilter}
                  onChange={(e) => setDecisionFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All Decisions</option>
                  <option value="pending">Pending</option>
                  <option value="hired">Hired</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Has Interview</label>
                <select
                  value={hasInterview}
                  onChange={(e) => setHasInterview(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Score</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scoreMin}
                  onChange={(e) => setScoreMin(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Score</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scoreMax}
                  onChange={(e) => setScoreMax(e.target.value)}
                  placeholder="100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="col-span-full flex space-x-3">
                <button
                  type="submit"
                  className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Apply Filters
                </button>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Reset All
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Table */}
      {data && data.results.length > 0 ? (
        <div className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applicant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Decision
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applied
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.results.map((applicant) => (
                  <tr key={applicant.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{applicant.full_name}</div>
                          <div className="text-sm text-gray-500">{applicant.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(applicant.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        {applicant.application_source === "online" ? "🌐 Online" : "🚶 Walk-in"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{applicant.interview?.position || "N/A"}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {applicant.result ? (
                        getScoreBadge(applicant.result.final_score, applicant.result.passed)
                      ) : (
                        <span className="text-sm text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {applicant.result?.final_decision ? (
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            applicant.result.final_decision === "hired"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {applicant.result.final_decision.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Pending</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(applicant.application_date).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-500">{applicant.days_since_application} days ago</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link
                        href={`/hr-dashboard/history/${applicant.id}`}
                        className="text-orange-600 hover:text-orange-900"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
            <div className="flex items-center space-x-4">
              <label className="text-sm text-gray-700">Items per page:</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {currentPage} of {data.total_pages}
              </span>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === data.total_pages}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(data.total_pages)}
                disabled={currentPage === data.total_pages}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border-2 border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-lg">No applicants found matching your criteria.</p>
          <button
            onClick={handleResetFilters}
            className="mt-4 px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
}

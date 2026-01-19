"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { getHRToken } from "@/lib/auth-hr";
import { API_BASE_URL } from "@/lib/apiBase";

interface Applicant {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  application_date: string;
  reapplication_date?: string | null;
  days_until_reapply?: number | null;
  position_applied?: string | null;
  applicant_status?: string | null;
  applicant_status_key?: string | null;
  needs_hr_action?: boolean;
  has_pending_review?: boolean;
  pending_review_result_id?: number | null;
}

interface ApplicantsResponse {
  count?: number;
  results?: Applicant[];
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "no_interview", label: "No Interview" },
  { value: "interview_in_progress", label: "Interview In Progress" },
  { value: "pending_hr_decision", label: "Pending HR Decision" },
  { value: "on_hold", label: "On Hold" },
  { value: "failed_cooldown", label: "Failed (Cooldown)" },
  { value: "eligible_reapply", label: "Eligible to Reapply" },
  { value: "hired", label: "Hired" },
];

const ACTION_OPTIONS = [
  { value: "all", label: "All" },
  { value: "true", label: "Needs HR Action" },
  { value: "false", label: "No Action Needed" },
];

const getStatusBadge = (statusKey?: string | null) => {
  const colors: Record<string, string> = {
    no_interview: "bg-gray-100 text-gray-700",
    interview_in_progress: "bg-blue-100 text-blue-800",
    pending_hr_decision: "bg-amber-100 text-amber-800",
    on_hold: "bg-indigo-100 text-indigo-800",
    failed_cooldown: "bg-red-100 text-red-800",
    eligible_reapply: "bg-emerald-100 text-emerald-800",
    hired: "bg-green-100 text-green-800",
  };
  return colors[statusKey || ""] || "bg-slate-100 text-slate-700";
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

export default function ApplicantsPage() {
  const router = useRouter();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const params = new URLSearchParams();

      if (searchTerm.trim()) {
        params.set("search", searchTerm.trim());
      }
      if (statusFilter !== "all") {
        params.set("applicant_status", statusFilter);
      }
      if (actionFilter !== "all") {
        params.set("action_required", actionFilter);
      }
      if (dateFrom) {
        params.set("date_from", dateFrom);
      }
      if (dateTo) {
        params.set("date_to", dateTo);
      }

      params.set("page", String(currentPage));
      params.set("page_size", String(itemsPerPage));

      const response = await axios.get<ApplicantsResponse>(`${API_BASE_URL}/api/applicants/?${params.toString()}`, {
        headers,
        timeout: 15000,
      });
      const data = response.data;
      const fetched = data.results || [];
      setApplicants(Array.isArray(fetched) ? fetched : []);
      setTotalCount(typeof data.count === "number" ? data.count : fetched.length);
      setError("");
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError("Authentication required. Redirecting to login...");
        setTimeout(() => router.push("/hr-login"), 1500);
      } else if (err.response?.status === 403) {
        setError("Access denied. Please contact an HR Manager for permissions.");
      } else if (err.code === "ECONNABORTED") {
        setError("Request timed out. You can retry.");
      } else {
        setError(err.response?.data?.detail || "Failed to load applicants");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchTerm, statusFilter, actionFilter, dateFrom, dateTo, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, actionFilter, dateFrom, dateTo, itemsPerPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <div className="flex items-center space-x-3 mb-3">
            <span className="text-2xl">!</span>
            <h3 className="text-lg font-semibold text-red-900">Error Loading Applicants</h3>
          </div>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Applicants</h1>
          <p className="text-gray-600 mt-1">Person-centric lifecycle overview for HR action</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <div className="flex items-center space-x-2 mb-4">
          <span className="text-blue-600">Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Search</label>
            <input
              type="text"
              placeholder="Search by name, email, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Applicant Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Action Required</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>

        {(searchTerm || statusFilter !== "all" || actionFilter !== "all" || dateFrom || dateTo) && (
          <div className="mt-4">
            <button
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
                setActionFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
              className="text-sm text-purple-600 hover:text-purple-800 font-medium"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        {applicants.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applicant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applicant Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action Required</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reapply Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {applicants.map((applicant) => {
                    const actionLabel = applicant.needs_hr_action
                      ? "HR Decision Needed"
                      : applicant.applicant_status_key === "eligible_reapply"
                        ? "Eligible to Reapply"
                        : "None";
                    const actionClass = applicant.needs_hr_action
                      ? "bg-amber-100 text-amber-800"
                      : actionLabel === "Eligible to Reapply"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-gray-100 text-gray-600";
                    const reapplyDate = formatDate(applicant.reapplication_date || null);
                    const reapplyNote =
                      applicant.days_until_reapply && applicant.days_until_reapply > 0
                        ? `${applicant.days_until_reapply} days`
                        : null;
                    const reviewLink =
                      applicant.has_pending_review && applicant.pending_review_result_id
                        ? `/hr-dashboard/results/${applicant.pending_review_result_id}/review`
                        : null;

                    return (
                      <tr key={applicant.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm">
                          <div className="flex items-start gap-2">
                            <div>
                              <div className="font-medium text-gray-900">{applicant.full_name}</div>
                              <div className="text-xs text-gray-500">ID: #{applicant.id}</div>
                            </div>
                            <span
                              title={applicant.email}
                              className="text-xs text-gray-400 border border-gray-200 rounded-full px-2 py-0.5"
                            >
                              email
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {applicant.position_applied || "-"}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(
                              applicant.applicant_status_key
                            )}`}
                          >
                            {applicant.applicant_status || "Interview In Progress"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${actionClass}`}>
                            {actionLabel}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          <div>{reapplyDate}</div>
                          {reapplyNote && <div className="text-xs text-gray-400">{reapplyNote}</div>}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/hr-dashboard/applicants/${applicant.id}`}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100"
                            >
                              View Profile
                            </Link>
                            <Link
                              href={`/hr-dashboard/history/${applicant.id}`}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                            >
                              Interview History
                            </Link>
                            {reviewLink ? (
                              <Link
                                href={reviewLink}
                                className="inline-flex items-center px-3 py-1 text-xs font-medium text-purple-700 bg-purple-50 rounded-md hover:bg-purple-100"
                              >
                                Open Review
                              </Link>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1 text-xs font-medium text-gray-400 bg-gray-100 rounded-md">
                                Open Review
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-700">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                    {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} applicants
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="itemsPerPage" className="text-sm text-gray-700 whitespace-nowrap">
                      Show:
                    </label>
                    <select
                      id="itemsPerPage"
                      value={itemsPerPage}
                      onChange={(e) => setItemsPerPage(Number(e.target.value))}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <div className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </div>
                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
            {searchTerm || statusFilter !== "all" || actionFilter !== "all" || dateFrom || dateTo
              ? "No applicants match your filters"
              : "No applicants found"}
          </div>
        )}
      </div>
    </div>
  );
}

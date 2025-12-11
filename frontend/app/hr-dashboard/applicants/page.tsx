"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { getHRToken } from "@/lib/auth-hr";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface Applicant {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  application_date: string;
  reapplication_date?: string;
  application_source?: string;
  position_applied?: string;
  latitude?: number;
  longitude?: number;
  distance_from_office?: number;
}

export default function ApplicantsPage() {
  const router = useRouter();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [filteredApplicants, setFilteredApplicants] = useState<Applicant[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Edit modal state
  const [editingApplicant, setEditingApplicant] = useState<Applicant | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [updateLoading, setUpdateLoading] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterApplicants();
  }, [searchTerm, statusFilter, dateFrom, dateTo, applicants]);

  useEffect(() => {
    // Reset to first page when items per page changes
    setCurrentPage(1);
  }, [itemsPerPage]);

  const fetchData = async () => {
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Fetch applicants and results in parallel but tolerate partial failures
      const [applicantsRes, resultsRes] = await Promise.allSettled([
        axios.get(`${API_BASE_URL}/applicants/`, { headers, timeout: 15000 }),
        axios.get(`${API_BASE_URL}/results/`, { headers, timeout: 15000 }),
      ]);

      if (applicantsRes.status === "fulfilled") {
        const data = applicantsRes.value.data;
        const fetchedApplicants = data.results || data || [];
        setApplicants(Array.isArray(fetchedApplicants) ? fetchedApplicants : []);
      } else {
        console.warn("Applicants request failed:", applicantsRes.reason);
      }

      if (resultsRes.status === "fulfilled") {
        const data = resultsRes.value.data;
        const fetchedResults = data.results || data || [];
        setResults(Array.isArray(fetchedResults) ? fetchedResults : []);
      } else {
        console.warn("Results request failed:", resultsRes.reason);
      }
    } catch (error: any) {
      console.error("Error fetching applicants/results:", error);
      if (error.response?.status === 401) {
        setError("Authentication required. Redirecting to login...");
        setTimeout(() => {
          router.push("/hr-login");
        }, 1500);
      } else if (error.response?.status === 403) {
        setError("Access denied. Please contact an HR Manager for permissions.");
      } else if (error.code === "ECONNABORTED") {
        setError("Request timed out. You can retry.");
      } else {
        setError(error.response?.data?.detail || "Failed to load applicants");
      }
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <div className="flex items-center space-x-3 mb-3">
            <span className="text-2xl">⚠️</span>
            <h3 className="text-lg font-semibold text-red-900">Error Loading Applicants</h3>
          </div>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={() => {
              setError("");
              setLoading(true);
              fetchData();
            }}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const handleUpdateStatus = async () => {
    if (!editingApplicant || !newStatus) return;

    setUpdateLoading(true);
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      await axios.patch(`${API_BASE_URL}/applicants/${editingApplicant.id}/`, { status: newStatus }, { headers });

      // Refresh data
      await fetchData();

      // Close modal
      setEditingApplicant(null);
      setNewStatus("");

      alert("Status updated successfully!");
    } catch (error: any) {
      console.error("Error updating status:", error);
      alert(error.response?.data?.detail || "Failed to update status");
    } finally {
      setUpdateLoading(false);
    }
  };

  const filterApplicants = () => {
    let filtered = [...applicants];

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (applicant) =>
          applicant.full_name?.toLowerCase().includes(search) ||
          applicant.email?.toLowerCase().includes(search) ||
          applicant.phone?.includes(search) ||
          applicant.id.toString().includes(search)
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((applicant) => applicant.status === statusFilter);
    }

    // Apply date range filter
    if (dateFrom) {
      filtered = filtered.filter((applicant) => {
        const appDate = new Date(applicant.application_date);
        const fromDate = new Date(dateFrom);
        return appDate >= fromDate;
      });
    }
    if (dateTo) {
      filtered = filtered.filter((applicant) => {
        const appDate = new Date(applicant.application_date);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999); // Include the entire end date
        return appDate <= toDate;
      });
    }

    setFilteredApplicants(filtered);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      passed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      in_review: "bg-yellow-100 text-yellow-800",
      pending: "bg-gray-100 text-gray-800",
      hired: "bg-emerald-100 text-emerald-800",
      failed_training: "bg-orange-100 text-orange-800",
      failed_onboarding: "bg-rose-100 text-rose-800",
      withdrawn: "bg-slate-100 text-slate-800",
    };
    return colors[status] || "bg-blue-100 text-blue-800";
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      passed: "Passed - Interview",
      failed: "Failed - Interview",
      in_review: "In Review",
      pending: "Pending",
      hired: "Hired",
      failed_training: "Failed - Training",
      failed_onboarding: "Failed - Onboarding",
      withdrawn: "Withdrawn",
    };
    return labels[status] || status;
  };

  const formatApplicationSource = (applicant: Applicant) => {
    const source = applicant.application_source === "walk_in" ? "Walk-in" : "Online";
    if (applicant.distance_from_office !== undefined && applicant.distance_from_office !== null) {
      const distance = applicant.distance_from_office;
      if (distance < 1000) {
        return `${source} (${Math.round(distance)}m)`;
      }
      return `${source} (${(distance / 1000).toFixed(1)}km)`;
    }
    return source;
  };

  const canReapply = (applicant: Applicant) => {
    if (!applicant.reapplication_date) return null;

    const today = new Date();
    const reapplyDate = new Date(applicant.reapplication_date);
    const isEligible = today >= reapplyDate;

    return {
      isEligible,
      date: reapplyDate,
    };
  };

  const getApplicantResult = (applicantId: number) => {
    return results.find((r: any) => r.applicant?.id === applicantId);
  };

  const getResultBadge = (result: any) => {
    if (!result) return <span className="text-gray-400 text-xs">No interview</span>;

    const score = result.overall_score;
    if (score >= 75) {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">✓ Passed</span>;
    } else if (score >= 50 && score < 75) {
      return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">⏳ Review</span>
      );
    } else {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">✗ Failed</span>;
    }
  };

  const getHRReviewBadge = (result: any) => {
    if (!result) return <span className="text-gray-400 text-xs">-</span>;

    if (result.hr_reviewed_at) {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">✓ Reviewed</span>;
    }

    const score = result.overall_score;
    if (score >= 50 && score < 75) {
      return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
          ⚠ Needs Review
        </span>
      );
    }

    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">Auto</span>;
  };

  // Pagination logic
  const totalPages = Math.ceil(filteredApplicants.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedApplicants = filteredApplicants.slice(startIndex, endIndex);

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
            <span className="text-2xl">⚠️</span>
            <h3 className="text-lg font-semibold text-red-900">Error</h3>
          </div>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-br from-blue-500 to-cyan-600 p-3 rounded-xl shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Applicants</h1>
            <p className="text-gray-600 mt-1">Manage all applicants</p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 hover:shadow-lg transition-shadow duration-300">
        <div className="flex items-center space-x-2 mb-4">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Search */}
          <div className="md:col-span-2">
            <label className="flex items-center space-x-1 text-sm font-medium text-gray-700 mb-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <span>Search</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, email, phone, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-3 h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="flex items-center space-x-1 text-sm font-medium text-gray-700 mb-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <span>Status</span>
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_review">In Review</option>
              <option value="passed">Passed - Interview</option>
              <option value="failed">Failed - Interview</option>
              <option value="hired">Hired</option>
              <option value="failed_training">Failed - Training</option>
              <option value="failed_onboarding">Failed - Onboarding</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center space-x-1 text-sm font-medium text-gray-700 mb-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>Date From</span>
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="flex items-center space-x-1 text-sm font-medium text-gray-700 mb-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>Date To</span>
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Clear Filters */}
        {(searchTerm || statusFilter !== "all" || dateFrom || dateTo) && (
          <div className="mt-4">
            <button
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
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

      {/* Applicants Table */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        {paginatedApplicants.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">HR Review</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reapplication</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedApplicants.map((applicant) => {
                    const reapplyInfo = canReapply(applicant);
                    return (
                      <tr
                        key={applicant.id}
                        className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all duration-200 transform hover:scale-[1.01]"
                      >
                        <td className="px-6 py-4 text-sm">
                          <div>
                            <div className="font-medium text-gray-900">{applicant.full_name}</div>
                            <div className="text-xs text-gray-500">ID: #{applicant.id}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{applicant.position_applied || "-"}</td>
                        <td className="px-6 py-4 text-sm">{getResultBadge(getApplicantResult(applicant.id))}</td>
                        <td className="px-6 py-4 text-sm">{getHRReviewBadge(getApplicantResult(applicant.id))}</td>
                        <td className="px-6 py-4 text-sm">
                          {(applicant.status === "failed" ||
                            applicant.status === "failed_training" ||
                            applicant.status === "failed_onboarding" ||
                            applicant.status === "passed") &&
                          reapplyInfo ? (
                            <div className="relative group inline-block">
                              {reapplyInfo.isEligible ? (
                                <>
                                  <div className="inline-flex flex-col items-start cursor-help">
                                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                      ✓ Can reapply now
                                    </span>
                                    <span className="text-xs text-gray-600 mt-1">
                                      {reapplyInfo.date.toLocaleDateString()}
                                    </span>
                                  </div>
                                  <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded py-2 px-3 bottom-full left-1/2 transform -translate-x-1/2 mb-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    {applicant.status === "failed" &&
                                      "Eligible to reapply - 30 days waiting period has passed"}
                                    {applicant.status === "passed" &&
                                      "Eligible to reapply - 6 months waiting period has passed"}
                                    {applicant.status === "failed_training" &&
                                      "Eligible to reapply - 90 days waiting period has passed"}
                                    {applicant.status === "failed_onboarding" &&
                                      "Eligible to reapply - 180 days waiting period has passed"}
                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="inline-flex flex-col items-start cursor-help">
                                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
                                      {reapplyInfo.date.toLocaleDateString()}
                                    </span>
                                  </div>
                                  <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded py-2 px-3 bottom-full left-1/2 transform -translate-x-1/2 mb-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    {applicant.status === "failed" &&
                                      "Can reapply on this date (30 days after interview failure)"}
                                    {applicant.status === "passed" &&
                                      "Can reapply on this date (6 months after passing interview)"}
                                    {applicant.status === "failed_training" &&
                                      "Can reapply on this date (90 days after training failure)"}
                                    {applicant.status === "failed_onboarding" &&
                                      "Can reapply on this date (180 days after onboarding failure)"}
                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <button
                            onClick={() => {
                              setEditingApplicant(applicant);
                              setNewStatus(applicant.status);
                            }}
                            className="inline-flex items-center px-3 py-1 text-xs font-medium text-purple-600 bg-purple-50 rounded-md hover:bg-purple-100 transition-colors"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-700">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredApplicants.length)} of{" "}
                    {filteredApplicants.length} applicants
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
                      <option value={10}>10</option>
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
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 disabled:hover:scale-100"
                    >
                      Previous
                    </button>

                    {/* Page numbers */}
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((page) => {
                          // Show first, last, current, and adjacent pages
                          return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                        })
                        .map((page, index, array) => {
                          // Add ellipsis if there's a gap
                          const showEllipsisBefore = index > 0 && page - array[index - 1] > 1;
                          return (
                            <div key={page} className="flex items-center space-x-1">
                              {showEllipsisBefore && <span className="px-2 text-gray-500">...</span>}
                              <button
                                onClick={() => setCurrentPage(page)}
                                className={`px-3 py-1 text-sm rounded-lg transition-all duration-200 transform hover:scale-110 ${
                                  currentPage === page
                                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md"
                                    : "border border-gray-300 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700"
                                }`}
                              >
                                {page}
                              </button>
                            </div>
                          );
                        })}
                    </div>

                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 disabled:hover:scale-100"
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
            {searchTerm || statusFilter !== "all" || dateFrom || dateTo ? (
              <>
                <p className="mb-2">No applicants match your filters</p>
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("all");
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                >
                  Clear filters
                </button>
              </>
            ) : (
              "No applicants found"
            )}
          </div>
        )}
      </div>

      {/* Edit Status Modal */}
      {editingApplicant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Update Applicant Status</h3>
              <button
                onClick={() => {
                  setEditingApplicant(null);
                  setNewStatus("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Applicant:</p>
                <p className="text-base font-semibold text-gray-900">{editingApplicant.full_name}</p>
                <p className="text-sm text-gray-500">{editingApplicant.email}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Status: <span className="text-purple-600">{getStatusLabel(editingApplicant.status)}</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Status <span className="text-red-500">*</span>
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="pending">Pending</option>
                  <option value="in_review">In Review</option>
                  <option value="passed">Passed - Interview</option>
                  <option value="failed">Failed - Interview</option>
                  <option value="hired">Hired</option>
                  <option value="failed_training">Failed - Training</option>
                  <option value="failed_onboarding">Failed - Onboarding</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> Changing status to "Failed" types will automatically set reapplication dates:
                </p>
                <ul className="text-xs text-blue-700 mt-1 ml-4 list-disc">
                  <li>Failed - Interview: 30 days</li>
                  <li>Failed - Training: 90 days</li>
                  <li>Failed - Onboarding: 180 days</li>
                </ul>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleUpdateStatus}
                  disabled={updateLoading || !newStatus}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  {updateLoading ? "Updating..." : "Update Status"}
                </button>
                <button
                  onClick={() => {
                    setEditingApplicant(null);
                    setNewStatus("");
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

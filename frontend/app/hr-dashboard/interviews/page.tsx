"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { getHRToken } from "@/lib/auth-hr";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface Interview {
  id: number;
  applicant: {
    id: number;
    full_name: string;
    email: string;
    phone: string;
  };
  position_type?: string;
  status: string;
  created_at: string;
  submission_date?: string;
}

interface Result {
  id: number;
  interview: number;
  passed: boolean;
  overall_score: number;
  hr_reviewed_at?: string;
  communication_score?: number;
  technical_score?: number;
  problem_solving_score?: number;
}

type PriorityFilter = "all" | "urgent" | "normal";

export default function HRReviewQueuePage() {
  const router = useRouter();

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showReviewedOnly, setShowReviewedOnly] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [filters, setFilters] = useState({
    position: "all",
    dateFrom: "",
    dateTo: "",
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // ==========================
  // Helpers
  // ==========================
  const normalize = (data: any) => {
    if (Array.isArray(data)) return data;
    if (data?.results) return data.results;
    return [];
  };

  const getResultForInterview = (interviewId: number) => results.find((r) => r.interview === interviewId);

  const getDaysSinceInterview = (interview: Interview) => {
    const interviewDate = new Date(interview.created_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - interviewDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getPriority = (interview: Interview, result?: Result | undefined): PriorityFilter => {
    if (!result) return "normal";
    if (result.hr_reviewed_at) return "normal";
    const days = getDaysSinceInterview(interview);
    return days >= 3 ? "urgent" : "normal";
  };

  const getPriorityBadge = (priority: string) => {
    if (priority === "urgent") {
      return (
        <span className="flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          Urgent
        </span>
      );
    }
    return null;
  };

  const getReviewStatusBadge = (result?: Result) => {
    if (!result) {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">Processing</span>;
    }
    if (result.hr_reviewed_at) {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">✓ Reviewed</span>;
    }
    return (
      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
        ⏳ Pending Review
      </span>
    );
  };

  const getScoreBadge = (result?: Result) => {
    if (!result) return null;
    const score = result.overall_score;
    const colorClass = result.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${colorClass}`}>
        {score.toFixed(1)}% - {result.passed ? "Pass" : "Fail"}
      </span>
    );
  };

  // ==========================
  // Data fetching (Abort-safe, no axios timeout)
  // ==========================
  const fetchData = async (opts: { showLoading?: boolean; signal?: AbortSignal } = {}) => {
    const { showLoading = true, signal } = opts;

    if (showLoading) setLoading(true);

    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [interviewsRes, resultsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/interviews/?page_size=10`, {
          headers,
          signal,
        }),
        axios.get(`${API_BASE_URL}/results/?review_queue=true&page_size=10`, {
          headers,
          signal,
        }),
      ]);

      const fetchedInterviews: Interview[] = normalize(interviewsRes.data);
      const fetchedResults: Result[] = normalize(resultsRes.data);

      setInterviews(fetchedInterviews);
      setResults(fetchedResults);

      sessionStorage.setItem(
        "hr_review_cache",
        JSON.stringify({
          interviews: fetchedInterviews,
          results: fetchedResults,
          timestamp: Date.now(),
        })
      );
    } catch (err: any) {
      // HMR / unmount aborts → ignore
      if (axios.isCancel(err) || err?.name === "CanceledError" || err?.code === "ERR_CANCELED") {
        console.warn("HR review fetch aborted");
        return;
      }

      console.error("Error fetching HR review data:", err);
      setError("Failed to load review queue.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // ==========================
  // Initial load (cache-first + abort controller)
  // ==========================
  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      const cache = sessionStorage.getItem("hr_review_cache");

      if (cache) {
        try {
          const parsed = JSON.parse(cache);
          if (parsed?.interviews && parsed?.results) {
            setInterviews(parsed.interviews);
            setResults(parsed.results);
            setLoading(false);
            // background refresh
            fetchData({ showLoading: false, signal: controller.signal });
            return;
          }
        } catch {
          // ignore broken cache
        }
      }

      // no cache → normal fetch
      fetchData({ showLoading: true, signal: controller.signal });
    };

    load();

    return () => controller.abort();
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage, priorityFilter, filters, showReviewedOnly]);

  // ==========================
  // Derived data (memoized)
  // ==========================
  const filteredInterviews = useMemo(() => {
    if (!Array.isArray(interviews) || interviews.length === 0) return [];

    return interviews.filter((interview) => {
      const result = getResultForInterview(interview.id);

      if (!result) return false;

      // reviewed vs pending toggle
      if (showReviewedOnly && !result.hr_reviewed_at) return false;
      if (!showReviewedOnly && result.hr_reviewed_at) return false;

      // priority
      if (priorityFilter !== "all") {
        const priority = getPriority(interview, result);
        if (priority !== priorityFilter) return false;
      }

      // position
      if (filters.position !== "all" && interview.position_type !== filters.position) {
        return false;
      }

      // dates
      const interviewDate = new Date(interview.created_at);

      if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        if (interviewDate < fromDate) return false;
      }

      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (interviewDate > toDate) return false;
      }

      return true;
    });
  }, [interviews, results, priorityFilter, filters, showReviewedOnly]);

  const pendingReviews = useMemo(() => results.length, [results]);

  const urgentReviews = useMemo(
    () =>
      interviews.filter((i) => {
        const result = getResultForInterview(i.id);
        return result && !result.hr_reviewed_at && getDaysSinceInterview(i) >= 3;
      }).length,
    [interviews, results]
  );

  const reviewedToday = 0;

  // Pagination
  const safeItemsPerPage = itemsPerPage || 10;
  const totalPages = Math.max(1, Math.ceil(filteredInterviews.length / safeItemsPerPage));
  const startIndex = (currentPage - 1) * safeItemsPerPage;
  const endIndex = startIndex + safeItemsPerPage;

  const paginatedInterviews = useMemo(
    () => filteredInterviews.slice(startIndex, endIndex),
    [filteredInterviews, startIndex, endIndex]
  );

  // ==========================
  // Render branches
  // ==========================
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
          <div className="flex items-center space-x-3 mb-3">
            <span className="text-2xl">⚠️</span>
            <h3 className="text-lg font-semibold text-red-900">Error Loading Review Queue</h3>
          </div>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={() => {
              setError("");
              setLoading(true);
              const controller = new AbortController();
              fetchData({ showLoading: true, signal: controller.signal });
            }}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ==========================
  // Main Render
  // ==========================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <div className="flex items-center space-x-3 mb-6">
          <div className="bg-gradient-to-br from-orange-500 to-red-600 p-3 rounded-xl shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">HR Review Queue</h1>
            <p className="text-gray-600 mt-1">Review interview results and make hiring decisions</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-4 shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Reviews</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{pendingReviews}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-lg">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-200 rounded-xl p-4 shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Urgent (3+ days)</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{urgentReviews}</p>
              </div>
              <div className="bg-red-100 p-3 rounded-lg">
                <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Reviewed Today</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{reviewedToday}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 hover:shadow-lg transition-shadow duration-300">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900">Filters & View Options</h3>
          </div>
          <button
            onClick={() => {
              setShowReviewedOnly(false);
              setPriorityFilter("all");
              setFilters({ position: "all", dateFrom: "", dateTo: "" });
            }}
            className="text-sm text-orange-600 hover:text-orange-800 font-medium"
          >
            Reset All
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Review Status */}
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
              <span>Review Status</span>
            </label>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!showReviewedOnly}
                  onChange={() => setShowReviewedOnly(false)}
                  className="w-4 h-4 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700">Pending Only</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  checked={showReviewedOnly}
                  onChange={() => setShowReviewedOnly(true)}
                  className="w-4 h-4 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700">Reviewed</span>
              </label>
            </div>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="flex items-center space-x-1 text-sm font-medium text-gray-700 mb-2">
              <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Priority</span>
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="all">All Priority</option>
              <option value="urgent">Urgent (3+ days)</option>
              <option value="normal">Normal</option>
            </select>
          </div>

          {/* Position Filter */}
          <div>
            <label className="flex items-center space-x-1 text-sm font-medium text-gray-700 mb-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <span>Position</span>
            </label>
            <select
              value={filters.position}
              onChange={(e) => setFilters((prev) => ({ ...prev, position: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="all">All Positions</option>
              <option value="it_support">IT Support</option>
              <option value="customer_service">Customer Service</option>
              <option value="virtual_assistant">Virtual Assistant</option>
              <option value="sales_marketing">Sales & Marketing</option>
            </select>
          </div>
        </div>

        {/* Date Range */}
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
              value={filters.dateFrom}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
              value={filters.dateTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-orange-50 to-red-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Applicant
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Days Waiting
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Review Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedInterviews.length > 0 ? (
                paginatedInterviews.map((interview) => {
                  const result = getResultForInterview(interview.id);
                  const priority = getPriority(interview, result);
                  const daysWaiting = getDaysSinceInterview(interview);

                  return (
                    <tr
                      key={interview.id}
                      className={`hover:bg-gradient-to-r hover:from-orange-50 hover:to-transparent transition-all duration-200 ${
                        priority === "urgent" && !result?.hr_reviewed_at ? "bg-red-50 border-l-4 border-red-500" : ""
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        {!result?.hr_reviewed_at && getPriorityBadge(priority)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{interview.applicant?.full_name}</div>
                          <div className="text-sm text-gray-500">{interview.applicant?.email}</div>
                          <div className="text-xs text-gray-400">ID: #{interview.id}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {interview.position_type ? (
                          <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 rounded-md font-medium">
                            {interview.position_type.replace("_", " ").toUpperCase()}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{getScoreBadge(result)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex flex-col">
                          <span className={`font-medium ${daysWaiting >= 3 ? "text-red-600" : "text-gray-900"}`}>
                            {daysWaiting} {daysWaiting === 1 ? "day" : "days"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(interview.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{getReviewStatusBadge(result)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {result ? (
                          <Link
                            href={`/hr-dashboard/results/${result.id}/review`}
                            className="inline-flex items-center px-3 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all duration-300 transform hover:scale-105 shadow-md font-medium"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                              />
                            </svg>
                            {result.hr_reviewed_at ? "View" : "Review Now"}
                          </Link>
                        ) : (
                          <span className="text-gray-400 text-xs">Processing...</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <svg
                        className="w-16 h-16 text-gray-300 mb-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p className="text-gray-500 font-medium">
                        {showReviewedOnly ? "No reviewed interviews found" : "No pending reviews! 🎉"}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {showReviewedOnly
                          ? "Try changing your filters"
                          : "All interviews have been reviewed or are still processing"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredInterviews.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-700">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredInterviews.length)} of{" "}
                  {filteredInterviews.length} {showReviewedOnly ? "reviewed" : "pending"} reviews
                  {filteredInterviews.length !==
                    (showReviewedOnly ? results.filter((r) => r.hr_reviewed_at).length : pendingReviews) && (
                    <span className="text-gray-500 ml-1">(filtered)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="itemsPerPage" className="text-sm text-gray-700 whitespace-nowrap">
                    Per page:
                  </label>
                  <select
                    id="itemsPerPage"
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-orange-50 hover:border-orange-400 hover:text-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 disabled:hover:scale-100"
                  >
                    Previous
                  </button>

                  <div className="flex items-center space-x-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                      .map((page, index, array) => {
                        const showEllipsisBefore = index > 0 && page - array[index - 1] > 1;
                        return (
                          <div key={page} className="flex items-center space-x-1">
                            {showEllipsisBefore && <span className="px-2 text-gray-500">...</span>}
                            <button
                              onClick={() => setCurrentPage(page)}
                              className={`px-3 py-1 text-sm rounded-lg transition-all duration-200 transform hover:scale-110 ${
                                currentPage === page
                                  ? "bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-md"
                                  : "border border-gray-300 hover:bg-orange-50 hover:border-orange-400 hover:text-orange-700"
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
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-orange-50 hover:border-orange-400 hover:text-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 disabled:hover:scale-100"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authAPI } from "@/lib/api";
import { api } from "@/lib/apiClient";
import { useCountUp } from "@/hooks/useCountUp";

type AnalyticsMode = "recruiter" | "system";

interface RecruiterInsightsData {
  pending_reviews: number;
  overdue_reviews: number;
  avg_hr_decision_time: number;
  interviews_waiting_today: number;
  interviews_waiting_week: number;
  ai_hr_mismatch_count: number;
}

interface SystemAnalyticsData {
  period: string;
  total_applicants: number;
  total_interviews: number;
  total_results: number;
  pass_rate: number;
  avg_score: number;
  status_breakdown: Record<string, number>;
  position_breakdown: Record<string, number>;
  scores_by_position: Record<string, number>;
  recent_activity: { date: string; applicants: number; interviews: number; results: number }[];
  score_distribution: { range: string; count: number }[];
  funnel: { applied: number; interviewed: number; passed: number; hired: number };
}

interface AnalyticsPermissions {
  is_hr_recruiter?: boolean;
  is_hr_manager?: boolean;
  is_superuser?: boolean;
  can_view_recruiter_insights?: boolean;
  can_view_system_analytics?: boolean;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [permissions, setPermissions] = useState<AnalyticsPermissions | null>(null);
  const [mode, setMode] = useState<AnalyticsMode>("recruiter");
  const [selectedPeriod, setSelectedPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [recruiterInsights, setRecruiterInsights] = useState<RecruiterInsightsData | null>(null);
  const [systemAnalytics, setSystemAnalytics] = useState<SystemAnalyticsData | null>(null);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");
  const [navHoverCard, setNavHoverCard] = useState<string | null>(null);

  const pendingReviews = useCountUp(recruiterInsights?.pending_reviews ?? 0);
  const overdueReviews = useCountUp(recruiterInsights?.overdue_reviews ?? 0);
  const avgDecisionTime = useCountUp(recruiterInsights?.avg_hr_decision_time ?? 0);
  const waitingToday = useCountUp(recruiterInsights?.interviews_waiting_today ?? 0);
  const waitingWeek = useCountUp(recruiterInsights?.interviews_waiting_week ?? 0);
  const mismatchCount = useCountUp(recruiterInsights?.ai_hr_mismatch_count ?? 0);

  const totalApplicants = useCountUp(systemAnalytics?.total_applicants ?? 0);
  const totalInterviews = useCountUp(systemAnalytics?.total_interviews ?? 0);
  const passRate = useCountUp(systemAnalytics?.pass_rate ?? 0);
  const avgScore = useCountUp(systemAnalytics?.avg_score ?? 0);

  const canViewRecruiter = useMemo(() => {
    if (!permissions) return false;
    return (
      permissions.can_view_recruiter_insights ??
      !!(permissions.is_hr_recruiter || permissions.is_hr_manager || permissions.is_superuser)
    );
  }, [permissions]);

  const canViewSystem = useMemo(() => {
    if (!permissions) return false;
    return (
      permissions.can_view_system_analytics ??
      !!(permissions.is_hr_manager || permissions.is_superuser)
    );
  }, [permissions]);

  useEffect(() => {
    loadPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!permissions) return;
    if (mode === "recruiter" && !canViewRecruiter) {
      setError("You do not have access to recruiter insights.");
      return;
    }
    if (mode === "system" && !canViewSystem) {
      setError("You do not have access to system analytics.");
      return;
    }
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions, mode, selectedPeriod]);

  const loadPermissions = async () => {
    setLoadingPermissions(true);
    setError("");
    try {
      const authRes = await authAPI.checkAuth();
      const perms = authRes.data?.permissions || {};
      setPermissions(perms);

      const recruiterAccess =
        perms.can_view_recruiter_insights ?? !!(perms.is_hr_recruiter || perms.is_hr_manager || perms.is_superuser);
      const systemAccess =
        perms.can_view_system_analytics ?? !!(perms.is_hr_manager || perms.is_superuser);

      if (recruiterAccess) {
        setMode("recruiter");
      } else if (systemAccess) {
        setMode("system");
      } else {
        setError("You do not have access to analytics.");
      }
    } catch (err: any) {
      console.error("Error checking access:", err);
      if (err.response?.status === 401) {
        setError("Authentication required. Redirecting to login...");
        setTimeout(() => router.push("/hr-login"), 1500);
      } else {
        setError(err.response?.data?.detail || "Failed to load analytics permissions");
      }
    } finally {
      setLoadingPermissions(false);
    }
  };

  const fetchAnalytics = async () => {
    setLoadingData(true);
    setError("");
    try {
      if (mode === "recruiter") {
        const response = await api.get("/analytics/recruiter/");
        setRecruiterInsights(response.data);
      } else {
        const response = await api.get("/analytics/system/", { params: { period: selectedPeriod } });
        setSystemAnalytics(response.data);
      }
    } catch (err: any) {
      console.error("Error fetching analytics:", err);
      if (err.response?.status === 401) {
        setError("Authentication required. Redirecting to login...");
        setTimeout(() => router.push("/hr-login"), 1500);
      } else {
        setError(err.response?.data?.detail || "Failed to load analytics data");
      }
    } finally {
      setLoadingData(false);
    }
  };

  const formatPositionType = (type: string) => {
    return type.replace(/_/g, " ").toUpperCase();
  };

  const formatStatusLabel = (status: string) => {
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const actionableCardBase =
    "border-2 rounded-xl p-6 shadow-md transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:brightness-[1.02] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2";
  const passiveCardBase = "border-2 rounded-xl p-6 shadow-md transition-all duration-150 ease-out";

  if (loadingPermissions || loadingData) {
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
            <h3 className="text-lg font-semibold text-red-900">Error</h3>
          </div>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (mode === "recruiter" && !recruiterInsights) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-gray-500">No recruiter insights available</p>
      </div>
    );
  }

  if (mode === "system" && !systemAnalytics) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-gray-500">No system analytics available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 animate-fade-in">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-3 rounded-xl shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {mode === "recruiter" ? "Recruiter Insights" : "System Analytics"}
            </h1>
            <p className="text-gray-600 mt-1">
              {mode === "recruiter"
                ? "Metrics shown here reflect items requiring HR action."
                : "System Analytics - Optimization & Oversight"}
            </p>
          </div>
        </div>

        {canViewRecruiter && canViewSystem && (
          <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setMode("recruiter")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === "recruiter" ? "bg-purple-600 text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Recruiter Insights
            </button>
            <button
              onClick={() => setMode("system")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === "system" ? "bg-purple-600 text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              System Analytics
            </button>
          </div>
        )}

        {mode === "system" && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Period:</span>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as "7d" | "30d" | "90d" | "all")}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
        )}
      </div>

      {mode === "recruiter" && recruiterInsights && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <button
              type="button"
              onClick={() => router.push("/hr-dashboard/interviews?review_status=pending")}
              onMouseEnter={() => setNavHoverCard("pending")}
              onMouseLeave={() => setNavHoverCard(null)}
              className={`${actionableCardBase} bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200 text-left animate-fade-in`}
              style={{ animationDelay: "40ms" }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Pending Reviews</h3>
                <span className="text-2xl">...</span>
              </div>
              <p className="text-4xl font-bold text-blue-600 tabular-nums">{Math.round(pendingReviews)}</p>
              <p className="text-xs text-gray-500 mt-2">
                {navHoverCard === "pending" ? "Open pending review queue" : "Awaiting HR decision"}
              </p>
            </button>

            <button
              type="button"
              onClick={() => router.push("/hr-dashboard/interviews?review_status=pending&overdue=1")}
              onMouseEnter={() => setNavHoverCard("overdue")}
              onMouseLeave={() => setNavHoverCard(null)}
              className={`${actionableCardBase} bg-gradient-to-br from-red-50 to-rose-50 border-red-200 text-left animate-fade-in`}
              style={{ animationDelay: "80ms" }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Pending &gt; 48 Hours</h3>
                <span className="text-2xl">...</span>
              </div>
              <p className="text-4xl font-bold text-red-600 tabular-nums">{Math.round(overdueReviews)}</p>
              <p className="text-xs text-gray-500 mt-2">
                {navHoverCard === "overdue" ? "Review overdue interviews" : "Overdue reviews to triage"}
              </p>
            </button>

            <div
              className={`${passiveCardBase} bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 animate-fade-in`}
              style={{ animationDelay: "120ms" }}
              title="Average time between interview completion and HR finalize."
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Avg Time to HR Decision</h3>
                <span className="text-2xl">...</span>
              </div>
              <p className="text-4xl font-bold text-amber-600 tabular-nums">{avgDecisionTime.toFixed(1)}h</p>
              <p className="text-xs text-gray-500 mt-2">Based on decided reviews</p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/hr-dashboard/interview-review?status=processing_or_submitted")}
              onMouseEnter={() => setNavHoverCard("waiting")}
              onMouseLeave={() => setNavHoverCard(null)}
              className={`${actionableCardBase} bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200 text-left animate-fade-in`}
              style={{ animationDelay: "160ms" }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Interviews Waiting</h3>
                <span className="text-2xl">...</span>
              </div>
              <div className="flex items-baseline space-x-4">
                <div>
                  <p className="text-3xl font-bold text-emerald-600 tabular-nums">{Math.round(waitingToday)}</p>
                  <p className="text-xs text-gray-500 mt-1">Today</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-emerald-600 tabular-nums">{Math.round(waitingWeek)}</p>
                  <p className="text-xs text-gray-500 mt-1">This week</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                {navHoverCard === "waiting" ? "Open interview review list" : "New interviews queued for review"}
              </p>
            </button>

            <button
              type="button"
              onClick={() => router.push("/hr-dashboard/ai-vs-hr?mismatch=1")}
              onMouseEnter={() => setNavHoverCard("mismatch")}
              onMouseLeave={() => setNavHoverCard(null)}
              className={`${actionableCardBase} bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200 text-left animate-fade-in`}
              style={{ animationDelay: "200ms" }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">AI vs HR Mismatch</h3>
                <span className="text-2xl">...</span>
              </div>
              <p className="text-4xl font-bold text-indigo-600 tabular-nums">{Math.round(mismatchCount)}</p>
              <p className="text-xs text-gray-500 mt-2">
                {navHoverCard === "mismatch" ? "Review mismatched decisions" : "Requires review alignment"}
              </p>
            </button>
          </div>
        </div>
      )}

      {mode === "system" && systemAnalytics && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div
              className={`${passiveCardBase} bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200 animate-fade-in`}
              style={{ animationDelay: "40ms" }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Total Applicants</h3>
                <span className="text-3xl">...</span>
              </div>
              <p className="text-4xl font-bold text-blue-600 tabular-nums">{Math.round(totalApplicants)}</p>
              <p className="text-xs text-gray-500 mt-2">Total applications received</p>
            </div>

            <div
              className={`${passiveCardBase} bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 animate-fade-in`}
              style={{ animationDelay: "80ms" }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Interviews Completed</h3>
                <span className="text-3xl">...</span>
              </div>
              <p className="text-4xl font-bold text-green-600 tabular-nums">{Math.round(totalInterviews)}</p>
              <p className="text-xs text-gray-500 mt-2">
                {systemAnalytics.total_applicants > 0
                  ? `${((systemAnalytics.total_interviews / systemAnalytics.total_applicants) * 100).toFixed(
                      1
                    )}% conversion rate`
                  : "No conversion data"}
              </p>
            </div>

            <div
              className={`${passiveCardBase} bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200 animate-fade-in`}
              style={{ animationDelay: "120ms" }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Pass Rate</h3>
                <span className="text-3xl">...</span>
              </div>
              <p className="text-4xl font-bold text-purple-600 tabular-nums">{passRate.toFixed(1)}%</p>
              <p className="text-xs text-gray-500 mt-2">{systemAnalytics.funnel.passed} candidates passed</p>
            </div>

            <div
              className={`${passiveCardBase} bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200 animate-fade-in`}
              style={{ animationDelay: "160ms" }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Average Score</h3>
                <span className="text-3xl">...</span>
              </div>
              <p className="text-4xl font-bold text-orange-600 tabular-nums">{avgScore.toFixed(1)}%</p>
              <p className="text-xs text-gray-500 mt-2">Overall interview performance</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <h3 className="text-xl font-bold text-gray-900">Applicant Status Breakdown</h3>
              </div>
              <div className="space-y-3">
                {Object.entries(systemAnalytics.status_breakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count], index) => {
                    const percentage =
                      systemAnalytics.total_applicants > 0
                        ? ((count / systemAnalytics.total_applicants) * 100).toFixed(1)
                        : "0.0";
                    const colors = [
                      "bg-blue-500",
                      "bg-green-500",
                      "bg-purple-500",
                      "bg-orange-500",
                      "bg-red-500",
                      "bg-pink-500",
                      "bg-indigo-500",
                      "bg-teal-500",
                    ];
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">{formatStatusLabel(status)}</span>
                          <span className="text-sm font-bold text-gray-900">
                            {count} ({percentage}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`${colors[index % colors.length]} h-2 rounded-full transition-all duration-500`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <h3 className="text-xl font-bold text-gray-900">Interviews by Position</h3>
              </div>
              <div className="space-y-3">
                {Object.entries(systemAnalytics.position_breakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([position, count]) => {
                    const percentage =
                      systemAnalytics.total_interviews > 0
                        ? ((count / systemAnalytics.total_interviews) * 100).toFixed(1)
                        : "0.0";
                    const avgScore = systemAnalytics.scores_by_position[position] || 0;
                    return (
                      <div key={position} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">{formatPositionType(position)}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">Avg: {avgScore.toFixed(1)}%</span>
                            <span className="text-sm font-bold text-purple-600">{count}</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <h3 className="text-xl font-bold text-gray-900">Activity Trend (Last 7 Days)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Applicants</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Interviews</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Results</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {systemAnalytics.recent_activity.map((day) => (
                    <tr key={day.date} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{new Date(day.date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-3 py-1.5 text-base font-bold rounded-full bg-blue-100 text-blue-700">
                          {day.applicants}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-3 py-1.5 text-base font-bold rounded-full bg-green-100 text-green-700">
                          {day.interviews}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-3 py-1.5 text-base font-bold rounded-full bg-purple-100 text-purple-700">
                          {day.results}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <h3 className="text-xl font-bold text-gray-900">Score Distribution</h3>
            </div>
            <div className="flex items-end justify-between h-64 space-x-2">
              {(() => {
                const maxCount = Math.max(0, ...systemAnalytics.score_distribution.map((bucket) => bucket.count));
                return systemAnalytics.score_distribution.map((bucket) => {
                  const height = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
                  const colors: Record<string, string> = {
                    "0-20": "bg-red-500",
                    "21-40": "bg-orange-500",
                    "41-60": "bg-yellow-500",
                    "61-80": "bg-blue-500",
                    "81-100": "bg-green-500",
                  };
                  return (
                    <div key={bucket.range} className="flex-1 flex flex-col items-center">
                      <div className="w-full flex items-end justify-center mb-2" style={{ height: "200px" }}>
                        <div
                          className={`w-full ${colors[bucket.range] || "bg-gray-400"} rounded-t-lg transition-all duration-500 hover:opacity-80 cursor-pointer relative group`}
                          style={{ height: `${height}%` }}
                        >
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-2 py-1 rounded text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            {bucket.count} candidates
                          </div>
                        </div>
                      </div>
                      <p className="text-xs font-medium text-gray-600 mt-1">{bucket.range}</p>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          <div className="bg-gradient-to-br from-pink-50 to-rose-50 border-2 border-pink-200 rounded-xl p-6 shadow-md">
            <div className="flex items-center space-x-2 mb-4">
              <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 className="text-xl font-bold text-gray-900">Applicant Funnel Conversion</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-sm text-gray-700">Applied</span>
                </div>
                <span className="text-lg font-bold text-gray-900">{systemAnalytics.funnel.applied}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-700">Interviewed</span>
                </div>
                <span className="text-lg font-bold text-gray-900">{systemAnalytics.funnel.interviewed}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <span className="text-sm text-gray-700">Passed</span>
                </div>
                <span className="text-lg font-bold text-gray-900">{systemAnalytics.funnel.passed}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-pink-500 rounded-full"></div>
                  <span className="text-sm text-gray-700">Hired</span>
                </div>
                <span className="text-lg font-bold text-gray-900">{systemAnalytics.funnel.hired}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

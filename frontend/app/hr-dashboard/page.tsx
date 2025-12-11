"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { hrClient, getHRToken } from "@/lib/axios/hrClient";

interface DashboardStats {
  total_applicants: number;
  total_interviews: number;
  pending_reviews: number;
  completed_today: number;
  pass_rate: number;
  avg_score: number;
}

interface RecentInterview {
  id: number;
  result_id?: number;
  applicant?: any;
  interview_status?: string;
  passed?: boolean;
  overall_score?: number;
  created_at?: string;
  hr_reviewed?: boolean;
  has_result?: boolean;
}

export default function HRDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    total_applicants: 0,
    total_interviews: 0,
    pending_reviews: 0,
    completed_today: 0,
    pass_rate: 0,
    avg_score: 0,
  });
  const [recentInterviews, setRecentInterviews] = useState<RecentInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getHRToken();
    if (!token) {
      setError("Authentication required. Please log in again.");
      setLoading(false);
      return;
    }
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError("");

    try {
      const api = hrClient();

      const [resultsRes, interviewsRes, applicantsRes] = await Promise.all([
        api.get("/results/"),
        api.get("/interviews/"),
        api.get("/applicants/"),
      ]);

      const results = resultsRes.data.results || resultsRes.data;
      const interviews = interviewsRes.data.results || interviewsRes.data;
      const applicants = applicantsRes.data.results || applicantsRes.data;

      const pendingReviews = Array.isArray(results)
        ? results.filter((r: any) => r.recommendation === "review" || !r.hr_reviewed_at).length
        : 0;

      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const completedToday = Array.isArray(results)
        ? results.filter((r: any) => {
            if (!r.created_at) return false;
            const resultDate = new Date(r.created_at);
            const resultDay = new Date(resultDate.getFullYear(), resultDate.getMonth(), resultDate.getDate());
            return resultDay.getTime() === todayStart.getTime();
          }).length
        : 0;

      const passedResults = Array.isArray(results) ? results.filter((r: any) => r.passed).length : 0;
      const passRate = Array.isArray(results) && results.length > 0 ? (passedResults / results.length) * 100 : 0;

      const avgScore =
        Array.isArray(results) && results.length > 0
          ? results.reduce((sum: number, r: any) => sum + (r.overall_score || 0), 0) / results.length
          : 0;

      setStats({
        total_applicants: Array.isArray(applicants) ? applicants.length : 0,
        total_interviews: Array.isArray(interviews) ? interviews.length : 0,
        pending_reviews: pendingReviews,
        completed_today: completedToday,
        pass_rate: passRate,
        avg_score: avgScore,
      });

      if (Array.isArray(interviews)) {
        const recent = interviews
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5)
          .map((interview: any) => {
            const result = Array.isArray(results) ? results.find((r: any) => r.interview === interview.id) : null;

            return {
              id: interview.id,
              result_id: result?.id,
              applicant: interview.applicant,
              interview_status: interview.status,
              passed: result?.passed,
              overall_score: result?.overall_score,
              has_result: !!result,
              hr_reviewed: !!result?.hr_reviewed_at,
              created_at: interview.created_at,
            };
          });
        setRecentInterviews(recent);
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Failed to load dashboard data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

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
            <h3 className="text-lg font-semibold text-red-900">Error Loading Dashboard</h3>
          </div>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={() => fetchDashboardData()}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Retry
          </button>
          {error.includes("Authentication") && <p className="text-sm text-red-600 mt-2">Please log in again.</p>}
        </div>
      </div>
    );
  }

  const statCards = [
    { title: "Total Applicants", value: stats.total_applicants, color: "bg-blue-500", link: "/hr-dashboard/applicants" },
    { title: "Total Interviews", value: stats.total_interviews, color: "bg-green-500", link: "/hr-dashboard/results" },
    { title: "Pending Reviews", value: stats.pending_reviews, color: "bg-yellow-500", link: "/hr-dashboard/results?status=pending" },
    { title: "Completed Today", value: stats.completed_today, color: "bg-purple-500", link: "/hr-dashboard/results" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-gray-600 mt-1">Welcome to HireNow Pro HR Portal</p>
        </div>
        <Link
          href="/hr-dashboard/results"
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          View All Results
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => (
          <Link
            key={index}
            href={card.link}
            className="bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow p-6 border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">{card.title}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{card.value}</p>
              </div>
              <div className={`${card.color} text-white text-3xl p-4 rounded-full`}>•</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Pass Rate</span>
                <span className="text-sm font-semibold text-gray-900">{stats.pass_rate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${stats.pass_rate}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Average Score</span>
                <span className="text-sm font-semibold text-gray-900">{stats.avg_score.toFixed(1)}/100</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${stats.avg_score}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link
              href="/hr-dashboard/results?status=pending"
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-2xl">✓</span>
              <div>
                <p className="font-medium text-gray-900">Review Pending Interviews</p>
                <p className="text-sm text-gray-500">{stats.pending_reviews} waiting for review</p>
              </div>
            </Link>
            <Link
              href="/hr-dashboard/applicants"
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-2xl">👥</span>
              <div>
                <p className="font-medium text-gray-900">Manage Applicants</p>
                <p className="text-sm text-gray-500">View all applicants</p>
              </div>
            </Link>
            <Link
              href="/hr-dashboard/analytics"
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-2xl">📊</span>
              <div>
                <p className="font-medium text-gray-900">View Analytics</p>
                <p className="text-sm text-gray-500">Detailed reports and insights</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Interviews</h3>
          <Link href="/hr-dashboard/interviews" className="text-sm text-purple-600 hover:text-purple-700 font-medium">
            View All
          </Link>
        </div>
        {recentInterviews.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applicant
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentInterviews.map((interview) => (
                  <tr key={interview.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">#{interview.id}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {interview.applicant?.full_name || `Applicant ${interview.applicant?.id}`}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {interview.has_result ? (
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            interview.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {interview.passed ? "Passed" : "Failed"}
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            interview.interview_status === "submitted"
                              ? "bg-blue-100 text-blue-800"
                              : interview.interview_status === "in_progress"
                              ? "bg-yellow-100 text-yellow-800"
                              : interview.interview_status === "failed"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {interview.interview_status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {interview.created_at ? new Date(interview.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      {interview.result_id ? (
                        <Link
                          href={`/hr-dashboard/results/${interview.result_id}/review`}
                          className="text-purple-600 hover:text-purple-800 font-medium"
                        >
                          {interview.hr_reviewed ? "View Review" : "Review"}
                        </Link>
                      ) : (
                        <span className="text-gray-400 text-xs">Not ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No recent interviews found</p>
          </div>
        )}
      </div>
    </div>
  );
}

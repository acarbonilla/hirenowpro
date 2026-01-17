"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { getHRToken } from "@/lib/auth-hr";
import { API_BASE_URL } from "@/lib/apiBase";

interface ComparisonData {
  response_id: number;
  question_text: string;
  ai_score: number;
  hr_override_score: number | null;
  deviation: number;
  applicant_name: string;
  position_type: string;
  reviewed_at: string;
}

interface ComparisonStats {
  totalReviewed: number;
  totalOverrides: number;
  averageDeviation: number;
  agreementRate: number;
  overrideRate: number;
  higherScores: number;
  lowerScores: number;
  sameScores: number;
}

export default function AIComparisonPage() {
  const router = useRouter();
  const [comparisons, setComparisons] = useState<ComparisonData[]>([]);
  const [stats, setStats] = useState<ComparisonStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterType, setFilterType] = useState<"all" | "higher" | "lower" | "same">("all");
  const [sortBy, setSortBy] = useState<"deviation" | "date">("deviation");
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

  useEffect(() => {
    fetchComparisonData();
  }, []);

  const fetchComparisonData = async () => {
    setLoading(true);
    setError("");

    try {
      const token = getHRToken();

      if (!token) {
        setError("Please log in to view comparison data");
        setTimeout(() => router.push("/hr-login"), 1500);
        return;
      }

      // Fetch interviews directly to get video responses with HR overrides
      const interviewsResponse = await axios.get(`${API_BASE_URL}/interviews/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const interviews = interviewsResponse.data.results || interviewsResponse.data || [];

      console.log(`Fetched ${interviews.length} interviews`);

      // Extract comparison data from video responses with HR overrides
      const comparisonData: ComparisonData[] = [];

      for (const interview of interviews) {
        const responses = interview.video_responses || [];

        console.log(`Interview ${interview.id}: ${responses.length} responses, status: ${interview.status}`);

        for (const resp of responses) {
          // Only include responses that have HR overrides
          if (resp.hr_override_score !== null && resp.hr_override_score !== undefined) {
            console.log(`Found override - Response ${resp.id}: AI=${resp.ai_score}, HR=${resp.hr_override_score}`);

            comparisonData.push({
              response_id: resp.id,
              question_text: resp.question?.question_text || "Question not loaded",
              ai_score: resp.ai_score || 0,
              hr_override_score: resp.hr_override_score,
              deviation: Math.abs((resp.hr_override_score || 0) - (resp.ai_score || 0)),
              applicant_name: interview.applicant?.full_name || "Unknown",
              position_type: interview.position_type || "General",
              reviewed_at: resp.hr_reviewed_at || interview.created_at,
            });
          }
        }
      }

      console.log(`Total comparison data entries: ${comparisonData.length}`);

      setComparisons(comparisonData);
      calculateStats(comparisonData);
    } catch (err: any) {
      console.error("Error fetching comparison data:", err);
      if (err.response?.status === 401) {
        setError("Authentication required. Redirecting to login...");
        setTimeout(() => router.push("/hr-login"), 1500);
      } else {
        setError(err.response?.data?.detail || "Failed to load comparison data");
      }
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (data: ComparisonData[]) => {
    if (data.length === 0) {
      setStats({
        totalReviewed: 0,
        totalOverrides: 0,
        averageDeviation: 0,
        agreementRate: 0,
        overrideRate: 0,
        higherScores: 0,
        lowerScores: 0,
        sameScores: 0,
      });
      return;
    }

    const totalOverrides = data.length;
    const totalDeviation = data.reduce((sum, item) => sum + item.deviation, 0);
    const averageDeviation = totalDeviation / totalOverrides;

    const higherScores = data.filter((item) => (item.hr_override_score || 0) > item.ai_score).length;
    const lowerScores = data.filter((item) => (item.hr_override_score || 0) < item.ai_score).length;
    const sameScores = data.filter((item) => item.hr_override_score === item.ai_score).length;

    const agreementRate = (sameScores / totalOverrides) * 100;

    setStats({
      totalReviewed: totalOverrides,
      totalOverrides,
      averageDeviation: Math.round(averageDeviation * 10) / 10,
      agreementRate: Math.round(agreementRate * 10) / 10,
      overrideRate: 100,
      higherScores,
      lowerScores,
      sameScores,
    });
  };

  const getFilteredComparisons = () => {
    let filtered = [...comparisons];

    // Apply filter
    if (filterType === "higher") {
      filtered = filtered.filter((item) => (item.hr_override_score || 0) > item.ai_score);
    } else if (filterType === "lower") {
      filtered = filtered.filter((item) => (item.hr_override_score || 0) < item.ai_score);
    } else if (filterType === "same") {
      filtered = filtered.filter((item) => item.hr_override_score === item.ai_score);
    }

    // Apply sort
    if (sortBy === "deviation") {
      filtered.sort((a, b) => b.deviation - a.deviation);
    } else {
      filtered.sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime());
    }

    return filtered;
  };

  const filteredData = getFilteredComparisons();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-xl shadow-lg">
            <span className="text-3xl">⚖️</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">AI vs HR Score Comparison</h1>
            <p className="text-gray-600 mt-1">Analyze agreement between AI assessments and HR reviews</p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Total Overrides</h3>
            <span className="text-3xl">📝</span>
          </div>
          <p className="text-4xl font-bold text-blue-600">{stats?.totalOverrides || 0}</p>
          <p className="text-xs text-gray-500 mt-1">HR score adjustments</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Agreement Rate</h3>
            <span className="text-3xl">✅</span>
          </div>
          <p className="text-4xl font-bold text-green-600">{stats?.agreementRate || 0}%</p>
          <p className="text-xs text-gray-500 mt-1">{stats?.sameScores || 0} exact matches</p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-200 rounded-xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Avg Deviation</h3>
            <span className="text-3xl">📊</span>
          </div>
          <p className="text-4xl font-bold text-orange-600">{stats?.averageDeviation || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Points difference</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Score Changes</h3>
            <span className="text-3xl">🔄</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="text-center">
              <p className="text-xl font-bold text-green-600">↑{stats?.higherScores || 0}</p>
              <p className="text-xs text-gray-500">Higher</p>
            </div>
            <div className="text-gray-300">|</div>
            <div className="text-center">
              <p className="text-xl font-bold text-red-600">↓{stats?.lowerScores || 0}</p>
              <p className="text-xs text-gray-500">Lower</p>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Chart */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Score Distribution</h3>
        <div className="space-y-4">
          {/* HR Scored Higher */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">HR Scored Higher</span>
              <span className="text-sm text-gray-600">
                {stats?.higherScores || 0} (
                {stats?.totalOverrides ? Math.round(((stats.higherScores || 0) / stats.totalOverrides) * 100) : 0}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-gradient-to-r from-green-500 to-green-600 h-4 rounded-full transition-all"
                style={{
                  width: `${stats?.totalOverrides ? ((stats.higherScores || 0) / stats.totalOverrides) * 100 : 0}%`,
                }}
              ></div>
            </div>
          </div>

          {/* AI Scored Higher */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">AI Scored Higher</span>
              <span className="text-sm text-gray-600">
                {stats?.lowerScores || 0} (
                {stats?.totalOverrides ? Math.round(((stats.lowerScores || 0) / stats.totalOverrides) * 100) : 0}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-gradient-to-r from-red-500 to-red-600 h-4 rounded-full transition-all"
                style={{
                  width: `${stats?.totalOverrides ? ((stats.lowerScores || 0) / stats.totalOverrides) * 100 : 0}%`,
                }}
              ></div>
            </div>
          </div>

          {/* Same Score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Perfect Agreement</span>
              <span className="text-sm text-gray-600">
                {stats?.sameScores || 0} ({stats?.agreementRate || 0}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full transition-all"
                style={{ width: `${stats?.agreementRate || 0}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Sort */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">Filter:</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Overrides</option>
              <option value="higher">HR Scored Higher</option>
              <option value="lower">AI Scored Higher</option>
              <option value="same">Perfect Match</option>
            </select>
          </div>
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="deviation">Largest Deviation</option>
              <option value="date">Most Recent</option>
            </select>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold">Applicant</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Question</th>
                <th className="px-6 py-4 text-center text-sm font-semibold">AI Score</th>
                <th className="px-6 py-4 text-center text-sm font-semibold">HR Score</th>
                <th className="px-6 py-4 text-center text-sm font-semibold">Deviation</th>
                <th className="px-6 py-4 text-center text-sm font-semibold">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center space-y-3">
                      <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                      <p className="text-lg font-medium">No comparison data found</p>
                      <p className="text-sm">HR overrides will appear here once reviews are completed</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((item, index) => {
                  const hrHigher = (item.hr_override_score || 0) > item.ai_score;
                  const same = item.hr_override_score === item.ai_score;

                  return (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{item.applicant_name}</p>
                          <p className="text-xs text-gray-500">{item.position_type}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setSelectedQuestion(item.question_text)}
                          className="text-sm text-blue-600 hover:text-blue-800 hover:underline text-left line-clamp-2 cursor-pointer"
                          title="Click to view full question"
                        >
                          {item.question_text}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 text-blue-800 rounded-full font-semibold">
                          {item.ai_score}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 text-purple-800 rounded-full font-semibold">
                          {item.hr_override_score}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`px-3 py-1 text-sm font-semibold rounded-full ${
                            item.deviation === 0
                              ? "bg-green-100 text-green-800"
                              : item.deviation <= 10
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {item.deviation} pts
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {same ? (
                          <span className="inline-flex items-center space-x-1 text-blue-600">
                            <span>—</span>
                            <span className="text-xs">Same</span>
                          </span>
                        ) : hrHigher ? (
                          <span className="inline-flex items-center space-x-1 text-green-600">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span className="text-xs font-medium">
                              +{(item.hr_override_score || 0) - item.ai_score}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-red-600">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span className="text-xs font-medium">{(item.hr_override_score || 0) - item.ai_score}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Question Modal */}
      {selectedQuestion && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedQuestion(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-xl font-bold flex items-center space-x-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Full Question</span>
              </h3>
              <button
                onClick={() => setSelectedQuestion(null)}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <p className="text-gray-800 text-base leading-relaxed whitespace-pre-wrap">{selectedQuestion}</p>
              </div>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => setSelectedQuestion(null)}
                className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

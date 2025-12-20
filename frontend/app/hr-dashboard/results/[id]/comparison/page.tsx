"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { getHRToken } from "@/lib/auth-hr";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface Result {
  id: number;
  interview: number;
  applicant: {
    id: number;
    full_name: string;
    email: string;
    phone: string;
  };
  position_type: string;
  overall_score: number;
  communication_score: number;
  technical_score: number;
  problem_solving_score: number;
  passed: boolean;
  created_at: string;
  hr_reviewed_at?: string;
}

interface PositionAverages {
  position_type: string;
  avg_overall_score: number;
  avg_communication_score: number;
  avg_technical_score: number;
  avg_problem_solving_score: number;
  total_candidates: number;
  pass_rate: number;
}

export default function ComparisonPage() {
  const params = useParams();
  const router = useRouter();
  const resultId = params.id as string;

  const [result, setResult] = useState<Result | null>(null);
  const [allResults, setAllResults] = useState<Result[]>([]);
  const [positionAverages, setPositionAverages] = useState<PositionAverages | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (resultId) {
      fetchComparisonData();
    }
  }, [resultId]);

  const fetchComparisonData = async () => {
    setLoading(true);
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Fetch all results first
      const allResultsRes = await axios.get(`${API_BASE_URL}/results/`, { headers });
      const allResultsData = allResultsRes.data.results || allResultsRes.data || [];

      // Find the current result from the list
      const currentResult = allResultsData.find((r: Result) => r.id === parseInt(resultId));

      if (!currentResult) {
        setError("Result not found");
        setLoading(false);
        return;
      }

      setResult(currentResult);
      setAllResults(allResultsData);

      // Calculate position averages
      if (currentResult.position_type) {
        calculatePositionAverages(currentResult.position_type, allResultsData);
      }
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

  const calculatePositionAverages = (positionType: string, results: Result[]) => {
    const samePositionResults = results.filter((r) => r.position_type === positionType);

    if (samePositionResults.length === 0) {
      setPositionAverages(null);
      return;
    }

    const totalScores = samePositionResults.reduce(
      (acc, r) => ({
        overall: acc.overall + r.overall_score,
        communication: acc.communication + (r.communication_score || 0),
        technical: acc.technical + (r.technical_score || 0),
        problem_solving: acc.problem_solving + (r.problem_solving_score || 0),
      }),
      { overall: 0, communication: 0, technical: 0, problem_solving: 0 }
    );

    const count = samePositionResults.length;
    const passedCount = samePositionResults.filter((r) => r.passed).length;

    setPositionAverages({
      position_type: positionType,
      avg_overall_score: totalScores.overall / count,
      avg_communication_score: totalScores.communication / count,
      avg_technical_score: totalScores.technical / count,
      avg_problem_solving_score: totalScores.problem_solving / count,
      total_candidates: count,
      pass_rate: (passedCount / count) * 100,
    });
  };

  const getPercentilRank = (score: number, allScores: number[]) => {
    if (allScores.length === 0) return 0;
    const sorted = [...allScores].sort((a, b) => a - b);
    const rank = sorted.filter((s) => s < score).length;
    return Math.round((rank / sorted.length) * 100);
  };

  const getComparisonColor = (candidateScore: number, avgScore: number) => {
    const diff = candidateScore - avgScore;
    if (diff >= 10) return "text-green-600 bg-green-50 border-green-300";
    if (diff >= 5) return "text-green-600 bg-green-50 border-green-200";
    if (diff >= -5) return "text-gray-600 bg-gray-50 border-gray-200";
    if (diff >= -10) return "text-orange-600 bg-orange-50 border-orange-200";
    return "text-red-600 bg-red-50 border-red-300";
  };

  const getComparisonIcon = (candidateScore: number, avgScore: number) => {
    const diff = candidateScore - avgScore;
    if (diff >= 5) {
      return (
        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
      );
    }
    if (diff <= -5) {
      return (
        <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M14.707 12.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l2.293-2.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
      </svg>
    );
  };

  const formatPositionType = (type: string) => {
    return type.replace(/_/g, " ").toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
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

  if (!result || !positionAverages) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-gray-500 text-lg">No comparison data available</p>
          <Link href="/hr-dashboard/results" className="text-blue-600 hover:text-blue-800 mt-4 inline-block">
            Back to Interview Review
          </Link>
        </div>
      </div>
    );
  }

  const allOverallScores = allResults
    .filter((r) => r.position_type === result.position_type)
    .map((r) => r.overall_score);
  const percentile = getPercentilRank(result.overall_score, allOverallScores);

  const scoreCategories = [
    {
      name: "Overall Performance",
      candidate: result.overall_score,
      average: positionAverages.avg_overall_score,
      icon: "🎯",
    },
    {
      name: "Communication Skills",
      candidate: result.communication_score || 0,
      average: positionAverages.avg_communication_score,
      icon: "💬",
    },
    {
      name: "Technical Knowledge",
      candidate: result.technical_score || 0,
      average: positionAverages.avg_technical_score,
      icon: "🔧",
    },
    {
      name: "Problem Solving",
      candidate: result.problem_solving_score || 0,
      average: positionAverages.avg_problem_solving_score,
      icon: "🧩",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-xl shadow-lg">
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
            <h1 className="text-3xl font-bold text-gray-900">Performance Comparison</h1>
            <p className="text-gray-600 mt-1">Compare candidate against position benchmarks</p>
          </div>
        </div>
        <Link
          href={`/hr-dashboard/results/${resultId}/review`}
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105 shadow-md font-medium"
        >
          Back to Review
        </Link>
      </div>

      {/* Candidate Info Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{result.applicant.full_name}</h2>
            <p className="text-gray-600 mt-1">{result.applicant.email}</p>
            <div className="flex items-center space-x-4 mt-3">
              <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-md font-medium text-sm">
                {formatPositionType(result.position_type)}
              </span>
              <span
                className={`px-3 py-1 rounded-md font-medium text-sm ${
                  result.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}
              >
                {result.passed ? "✓ Passed" : "✗ Failed"}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold text-blue-600">{result.overall_score.toFixed(1)}%</div>
            <p className="text-sm text-gray-600 mt-2">Overall Score</p>
            <p className="text-xs text-gray-500 mt-1">
              {percentile}th percentile for {formatPositionType(result.position_type)}
            </p>
          </div>
        </div>
      </div>

      {/* Position Benchmark Card */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <div className="flex items-center space-x-2 mb-4">
          <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <h3 className="text-xl font-bold text-gray-900">Position Benchmarks</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Total Candidates</p>
            <p className="text-3xl font-bold text-gray-900">{positionAverages.total_candidates}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Average Score</p>
            <p className="text-3xl font-bold text-indigo-600">{positionAverages.avg_overall_score.toFixed(1)}%</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Pass Rate</p>
            <p className="text-3xl font-bold text-green-600">{positionAverages.pass_rate.toFixed(1)}%</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Your Rank</p>
            <p className="text-3xl font-bold text-purple-600">
              #{allOverallScores.filter((s) => s > result.overall_score).length + 1}
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Score Comparison */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-900">Detailed Score Analysis</h3>
          <p className="text-sm text-gray-600 mt-1">
            Comparing {result.applicant.full_name} against {positionAverages.total_candidates} other{" "}
            {formatPositionType(result.position_type)} candidates
          </p>
        </div>

        <div className="p-6 space-y-6">
          {scoreCategories.map((category, index) => {
            const diff = category.candidate - category.average;
            const diffPercent = ((diff / category.average) * 100).toFixed(1);
            const colorClass = getComparisonColor(category.candidate, category.average);

            return (
              <div key={index} className={`border-2 rounded-xl p-4 ${colorClass} transition-all duration-300`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <span className="text-3xl">{category.icon}</span>
                    <div>
                      <h4 className="font-bold text-lg">{category.name}</h4>
                      <p className="text-xs opacity-75">
                        {diff > 0 ? "+" : ""}
                        {diff.toFixed(1)} points ({diff > 0 ? "+" : ""}
                        {diffPercent}%)
                      </p>
                    </div>
                  </div>
                  {getComparisonIcon(category.candidate, category.average)}
                </div>

                {/* Score Bars */}
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">Candidate Score</span>
                      <span className="text-sm font-bold">{category.candidate.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${category.candidate}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium opacity-75">Position Average</span>
                      <span className="text-sm font-medium opacity-75">{category.average.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gray-400 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${category.average}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Performance Insight */}
                <div className="mt-3 pt-3 border-t border-current opacity-50">
                  <p className="text-xs font-medium">
                    {diff >= 10 && "🌟 Exceptional performance - significantly above average"}
                    {diff >= 5 && diff < 10 && "✨ Strong performance - above average"}
                    {diff >= -5 && diff < 5 && "📊 Average performance - meets expectations"}
                    {diff >= -10 && diff < -5 && "⚠️ Below average - consider additional evaluation"}
                    {diff < -10 && "🔴 Significantly below average - major concern"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strengths */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6 shadow-md">
          <div className="flex items-center space-x-2 mb-4">
            <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <h3 className="text-xl font-bold text-green-900">Key Strengths</h3>
          </div>
          <ul className="space-y-2">
            {scoreCategories
              .filter((cat) => cat.candidate - cat.average >= 5)
              .map((cat, idx) => (
                <li key={idx} className="flex items-start space-x-2">
                  <span className="text-green-600 mt-0.5">✓</span>
                  <span className="text-sm text-green-900">
                    <strong>{cat.name}:</strong> {cat.candidate.toFixed(1)}% ({(cat.candidate - cat.average).toFixed(1)}{" "}
                    points above average)
                  </span>
                </li>
              ))}
            {scoreCategories.filter((cat) => cat.candidate - cat.average >= 5).length === 0 && (
              <li className="text-sm text-green-900 italic">No areas significantly above average</li>
            )}
          </ul>
        </div>

        {/* Areas for Improvement */}
        <div className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200 rounded-xl p-6 shadow-md">
          <div className="flex items-center space-x-2 mb-4">
            <svg className="w-6 h-6 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <h3 className="text-xl font-bold text-orange-900">Areas for Improvement</h3>
          </div>
          <ul className="space-y-2">
            {scoreCategories
              .filter((cat) => cat.candidate - cat.average < -5)
              .map((cat, idx) => (
                <li key={idx} className="flex items-start space-x-2">
                  <span className="text-orange-600 mt-0.5">⚠</span>
                  <span className="text-sm text-orange-900">
                    <strong>{cat.name}:</strong> {cat.candidate.toFixed(1)}% (
                    {Math.abs(cat.candidate - cat.average).toFixed(1)} points below average)
                  </span>
                </li>
              ))}
            {scoreCategories.filter((cat) => cat.candidate - cat.average < -5).length === 0 && (
              <li className="text-sm text-orange-900 italic">No significant areas of concern</li>
            )}
          </ul>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-center space-x-4 pt-4">
        <Link
          href="/hr-dashboard/results"
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          Back to Interview Review
        </Link>
        <Link
          href={`/hr-dashboard/results/${resultId}/review`}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105 shadow-md font-medium"
        >
          View Full Review
        </Link>
      </div>
    </div>
  );
}

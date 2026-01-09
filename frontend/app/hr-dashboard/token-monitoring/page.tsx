"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { getHRToken } from "@/lib/auth-hr";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface TokenStats {
  total_requests: number;
  total_tokens: number;
  total_cost: string;
  today_requests: number;
  today_tokens: number;
  today_cost: string;
  this_month_requests: number;
  this_month_tokens: number;
  this_month_cost: string;
  avg_tokens_per_transcription: number;
  avg_tokens_per_analysis: number;
  avg_cost_per_interview: string;
  success_rate: number;
  avg_response_time: number;
}

interface TokenUsage {
  id: number;
  operation_type: string;
  operation_type_display: string;
  interview_id: number | null;
  video_response_id: number | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  model_name: string;
  api_response_time: number | null;
  estimated_cost: string;
  success: boolean;
  created_at: string;
}

interface OperationBreakdown {
  operation_type: string;
  count: number;
  total_tokens: number;
  total_cost: string;
  avg_tokens: number;
  avg_response_time: number;
}

export default function TokenMonitoringPage() {
  const router = useRouter();
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [recentUsage, setRecentUsage] = useState<TokenUsage[]>([]);
  const [operationBreakdown, setOperationBreakdown] = useState<OperationBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = getHRToken();
      if (!token) {
        router.push("/hr-login");
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };

      // Fetch all data in parallel
      const [statsRes, usageRes, breakdownRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/token-usage/statistics/`, { headers }),
        axios.get(`${API_BASE_URL}/token-usage/?page_size=20`, { headers }),
        axios.get(`${API_BASE_URL}/token-usage/by-operation/`, { headers }),
      ]);

      setStats(statsRes.data);
      setRecentUsage(usageRes.data.results || usageRes.data);
      setOperationBreakdown(breakdownRes.data);
    } catch (error: any) {
      console.error("Error fetching token data:", error);
      if (error.response?.status === 401) {
        setError("Authentication required. Redirecting...");
        setTimeout(() => router.push("/hr-login"), 1500);
      } else {
        setError(error.response?.data?.detail || "Failed to load token monitoring data");
      }
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatCost = (cost: string | number) => {
    const numCost = typeof cost === "string" ? parseFloat(cost) : cost;
    return `$${numCost.toFixed(4)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading token monitoring data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Token Usage Monitoring</h1>
          <p className="text-gray-600 mt-1">Track API token consumption and costs</p>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
          <p className="text-sm text-gray-500 font-medium">Total Requests</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{formatNumber(stats.total_requests)}</p>
          <p className="text-xs text-gray-400 mt-1">All time</p>
        </div>

        <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
          <p className="text-sm text-gray-500 font-medium">Total Tokens</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{formatNumber(stats.total_tokens)}</p>
          <p className="text-xs text-gray-400 mt-1">All time</p>
        </div>

        <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
          <p className="text-sm text-gray-500 font-medium">Total Cost</p>
          <p className="text-3xl font-bold text-green-600 mt-2">{formatCost(stats.total_cost)}</p>
          <p className="text-xs text-gray-400 mt-1">All time</p>
        </div>

        <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
          <p className="text-sm text-gray-500 font-medium">Success Rate</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">{stats.success_rate.toFixed(1)}%</p>
          <p className="text-xs text-gray-400 mt-1">API reliability</p>
        </div>
      </div>

      {/* Today & This Month */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-xl p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">📅 Today</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-700">Requests:</span>
              <span className="font-bold text-gray-900">{formatNumber(stats.today_requests)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Tokens:</span>
              <span className="font-bold text-gray-900">{formatNumber(stats.today_tokens)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Cost:</span>
              <span className="font-bold text-green-600">{formatCost(stats.today_cost)}</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200 rounded-xl p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">📊 This Month</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-700">Requests:</span>
              <span className="font-bold text-gray-900">{formatNumber(stats.this_month_requests)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Tokens:</span>
              <span className="font-bold text-gray-900">{formatNumber(stats.this_month_tokens)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Cost:</span>
              <span className="font-bold text-green-600">{formatCost(stats.this_month_cost)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Averages */}
      <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">📈 Averages</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">Per Transcription</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(Math.round(stats.avg_tokens_per_transcription))}
            </p>
            <p className="text-xs text-gray-400 mt-1">tokens</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">Per Analysis</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(Math.round(stats.avg_tokens_per_analysis))}
            </p>
            <p className="text-xs text-gray-400 mt-1">tokens</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">Per Interview</p>
            <p className="text-2xl font-bold text-green-600">{formatCost(stats.avg_cost_per_interview)}</p>
            <p className="text-xs text-gray-400 mt-1">cost</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">Response Time</p>
            <p className="text-2xl font-bold text-gray-900">{stats.avg_response_time.toFixed(2)}s</p>
            <p className="text-xs text-gray-400 mt-1">API latency</p>
          </div>
        </div>
      </div>

      {/* Operation Breakdown */}
      {operationBreakdown.length > 0 && (
        <div className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">🔍 Breakdown by Operation</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operation</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Count</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Tokens</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Tokens</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Cost</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {operationBreakdown.map((op, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                        {op.operation_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-900">{formatNumber(op.count)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">
                      {formatNumber(op.total_tokens)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {formatNumber(Math.round(op.avg_tokens))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-green-600 font-medium">
                      {formatCost(op.total_cost)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {op.avg_response_time?.toFixed(2) || "N/A"}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Usage */}
      {recentUsage.length > 0 && (
        <div className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">🕐 Recent API Calls</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operation</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Input</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Output</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentUsage.map((usage) => (
                  <tr key={usage.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">{usage.operation_type_display}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatNumber(usage.input_tokens)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatNumber(usage.output_tokens)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatNumber(usage.total_tokens)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                      {formatCost(usage.estimated_cost)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {usage.api_response_time ? `${usage.api_response_time.toFixed(2)}s` : "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          usage.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}
                      >
                        {usage.success ? "✓ Success" : "✗ Failed"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(usage.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

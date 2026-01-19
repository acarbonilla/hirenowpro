"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeUserType } from "@/lib/auth-hr";
import { getITToken, getITUser, clearITAuth } from "@/lib/auth-it";
import { api } from "@/lib/apiClient";

const ADMIN_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL || ""}/admin/`;

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

interface UserPermissions {
  is_hr_recruiter: boolean;
  is_hr_manager: boolean;
  is_it_support: boolean;
  is_staff: boolean;
  is_superuser: boolean;
}

export default function ITDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const token = getITToken();
    if (!token) {
      router.push("/it-login");
      return;
    }

      // Verify IT Support access
      const authRes = await api.get("/auth/check/", {
        headers: { Authorization: `Bearer ${token}`, "X-Portal": "IT" },
      });

      const permissions: UserPermissions = authRes.data.permissions;
      const userType = normalizeUserType(authRes.data?.user_type || authRes.data?.user?.user_type);
      const itPortalUserTypes = new Set(["IT_SUPPORT", "ADMIN", "SUPERADMIN"]);

      // Only IT Support can access this page
      if (!itPortalUserTypes.has(userType)) {
        setError("Access denied. IT Support role required.");
        clearITAuth();
        setTimeout(() => router.push("/it-login"), 2000);
        return;
      }

      setUser(authRes.data.user || getITUser());
      fetchStats();
    } catch (error: any) {
      console.error("Access check error:", error);
      if (error.response?.status === 401) {
        clearITAuth();
        router.push("/it-login");
      } else {
        setError("Failed to verify access");
      }
    }
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const token = getITToken();
      const headers = { Authorization: `Bearer ${token}` };

      const statsRes = await api.get("/token-usage/statistics/", { headers });
      setStats(statsRes.data);
    } catch (error: any) {
      console.error("Error fetching stats:", error);
      setError(error.response?.data?.detail || "Failed to load monitoring data");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
      clearITAuth();
      router.push("/");
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading IT dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">IT Admin Portal</h1>
                <p className="text-sm text-gray-500">System Monitoring & Administration</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user?.username}</p>
                <p className="text-xs text-gray-500">IT Support</p>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Welcome Card */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
            <h2 className="text-2xl font-bold mb-2">Welcome to IT Admin Portal</h2>
            <p className="text-blue-100">Monitor API usage, track costs, and manage system resources</p>
          </div>

          {/* Quick Stats */}
          {stats && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <p className="text-sm text-gray-500 font-medium">Total API Calls</p>
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
                      <span className="text-gray-700">API Calls:</span>
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
                      <span className="text-gray-700">API Calls:</span>
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
            </>
          )}

          {/* Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <a
              href="/it-dashboard/traffic-monitor"
              className="block bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-blue-500 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 13h2a2 2 0 002 2v2a2 2 0 002 2h6a2 2 0 002-2v-2a2 2 0 002-2h2M5 9h14a2 2 0 012 2v1H3v-1a2 2 0 012-2z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">System Traffic Monitor</h3>
                  <p className="text-sm text-gray-500">Detect task storms and outbound risk signals</p>
                </div>
              </div>
            </a>

            <a
              href="/hr-dashboard/token-monitoring"
              className="block bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-blue-500 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Detailed Token Monitoring</h3>
                  <p className="text-sm text-gray-500">View comprehensive API usage analytics</p>
                </div>
              </div>
            </a>

            <a
              href={ADMIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-green-500 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="bg-green-100 p-3 rounded-lg">
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Django Admin</h3>
                  <p className="text-sm text-gray-500">Access full admin interface</p>
                </div>
              </div>
            </a>
          </div>

          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <svg
                className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-blue-900">IT Support Access</h4>
                <p className="text-sm text-blue-700 mt-1">
                  You have access to system monitoring and token usage data. For HR-specific functions, please contact
                  an HR Manager.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getHRToken, getHRUser, normalizeUserType } from "@/lib/auth-hr";
import { api } from "@/lib/apiClient";

const ADMIN_USER_TYPES = new Set(["ADMIN", "SUPERADMIN"]);

type QueueDepth = {
  pending: number | null;
  active: number | null;
  retried: number | null;
};

type HealthSummary = {
  active_celery_workers: number | null;
  celery_queue_depth: QueueDepth;
  task_error_rate_last_15m: number;
  outbound_calls_last_15m: number;
  worker_restarts_last_1h: number | null;
};

type TrafficAmplification = {
  avg_tasks_per_interview_last_1h: number;
  max_tasks_for_single_interview_last_1h: number;
  avg_retries_per_task_last_15m: number;
  outbound_calls_per_interview_last_1h: number;
  idempotency_guard_hits_last_1h: number;
};

type RecentActivity = {
  timestamp: string;
  interview_id: number | null;
  task_name: string;
  state: string;
  retries: number | null;
  duration_seconds: number | null;
  worker_id: string | null;
  exited_via_idempotency_guard: boolean;
};

type ProviderSummary = {
  provider: string;
  calls_last_15m: number;
  error_count: number;
  retry_count: number;
  avg_latency_ms: number;
};

type RiskSignals = {
  worker_online_but_not_executing: boolean;
  repeated_worker_restart_detected: boolean;
  log_write_failures_detected: boolean;
  task_retries_spiking: boolean;
  outbound_calls_spiking: boolean;
  infrastructure_risk_level: "HIGH" | "NORMAL";
};

type MonitorPayload = {
  generated_at: string;
  data_quality_notes: string[];
  global_health_summary: HealthSummary;
  traffic_amplification_metrics: TrafficAmplification;
  recent_async_activity: RecentActivity[];
  outbound_api_summary: ProviderSummary[];
  provider_risk_signals: RiskSignals;
};

export default function TrafficMonitorPage() {
  const router = useRouter();
  const [data, setData] = useState<MonitorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isAdmin = useMemo(() => {
    const user = getHRUser();
    if (!user) return false;
    return ADMIN_USER_TYPES.has(normalizeUserType(user.user_type));
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
      setError("Missing API base URL.");
      setLoading(false);
      return;
    }

    const token = getHRToken();
    if (!token) {
      router.push("/hr-login");
      return;
    }

    if (!isAdmin) {
      setError("Admin access required.");
      setLoading(false);
      return;
    }

    let mounted = true;
    const fetchData = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const res = await api.get("/admin/system/traffic-monitor/", { headers });
        if (mounted) {
          setData(res.data);
          setError("");
        }
      } catch (err: any) {
        if (!mounted) return;
        if (err.response?.status === 401) {
          setError("Authentication required.");
          setTimeout(() => router.push("/hr-login"), 1200);
          return;
        }
        if (err.response?.status === 403) {
          setError("Admin access required.");
          return;
        }
        setError(err.response?.data?.detail || "Failed to load traffic monitor.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 45000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [router, isAdmin]);

  const formatNumber = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return "—";
    return new Intl.NumberFormat().format(value);
  };

  const formatPercent = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return "—";
    return `${(value * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading traffic monitor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-lg">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const riskLevel = data.provider_risk_signals.infrastructure_risk_level;
  const riskBanner =
    riskLevel === "HIGH"
      ? "bg-red-50 border-red-200 text-red-900"
      : "bg-emerald-50 border-emerald-200 text-emerald-900";

  const amplification = data.traffic_amplification_metrics;
  const health = data.global_health_summary;

  return (
    <div className="p-6 space-y-6">
      <div className={`border-2 rounded-xl p-6 ${riskBanner}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">System Traffic & Risk Monitor</h1>
            <p className="mt-1 text-sm">
              Early warning dashboard for async amplification and provider risk.
            </p>
          </div>
          <div className="text-sm">
            <div className="font-semibold">Overall Status: {riskLevel}</div>
            <div className="opacity-80">Updated {new Date(data.generated_at).toLocaleString()}</div>
          </div>
        </div>
        {riskLevel === "HIGH" && (
          <div className="mt-4 text-sm font-semibold">
            Infrastructure at risk — consider halting async processing and rebuilding infra.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">Active Workers</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatNumber(health.active_celery_workers)}
          </p>
        </div>
        <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">Queue Pending</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatNumber(health.celery_queue_depth.pending)}
          </p>
        </div>
        <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">Task Error Rate (15m)</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatPercent(health.task_error_rate_last_15m)}
          </p>
        </div>
        <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">Outbound Calls (15m)</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatNumber(health.outbound_calls_last_15m)}
          </p>
        </div>
      </div>

      <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Traffic Amplification Watch</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Avg tasks/interview (1h)</p>
            <p className={`text-lg font-semibold ${amplification.avg_tasks_per_interview_last_1h > 2 ? "text-red-600" : "text-gray-900"}`}>
              {amplification.avg_tasks_per_interview_last_1h.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Max tasks/interview (1h)</p>
            <p className={`text-lg font-semibold ${amplification.max_tasks_for_single_interview_last_1h > 3 ? "text-red-600" : "text-gray-900"}`}>
              {formatNumber(amplification.max_tasks_for_single_interview_last_1h)}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Avg retries/task (15m)</p>
            <p className={`text-lg font-semibold ${amplification.avg_retries_per_task_last_15m >= 1 ? "text-red-600" : "text-gray-900"}`}>
              {amplification.avg_retries_per_task_last_15m.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Outbound calls/interview (1h)</p>
            <p className={`text-lg font-semibold ${amplification.outbound_calls_per_interview_last_1h > 10 ? "text-red-600" : "text-gray-900"}`}>
              {amplification.outbound_calls_per_interview_last_1h.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Idempotency guard hits (1h)</p>
            <p className={`text-lg font-semibold ${amplification.idempotency_guard_hits_last_1h > 0 ? "text-amber-600" : "text-gray-900"}`}>
              {formatNumber(amplification.idempotency_guard_hits_last_1h)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Async Activity</h2>
          {data.recent_async_activity.length === 0 ? (
            <div className="text-sm text-gray-500">No recent tasks found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4">Timestamp</th>
                    <th className="py-2 pr-4">Interview</th>
                    <th className="py-2 pr-4">State</th>
                    <th className="py-2 pr-4">Retries</th>
                    <th className="py-2 pr-4">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_async_activity.map((row, index) => {
                    const isRetry = (row.retries || 0) > 1;
                    const isSlow = row.duration_seconds !== null && row.duration_seconds > 300;
                    const isGuard = row.exited_via_idempotency_guard;
                    const highlight = isRetry || isSlow || isGuard;
                    return (
                      <tr
                        key={`${row.timestamp}-${index}`}
                        className={`border-b ${highlight ? "bg-amber-50" : "bg-white"}`}
                      >
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {new Date(row.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4">{row.interview_id ?? "—"}</td>
                        <td className="py-2 pr-4">{row.state}</td>
                        <td className="py-2 pr-4">{row.retries ?? "—"}</td>
                        <td className="py-2 pr-4">
                          {row.duration_seconds !== null ? `${row.duration_seconds.toFixed(1)}s` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Outbound API Summary (15m)</h2>
          {data.outbound_api_summary.length === 0 ? (
            <div className="text-sm text-gray-500">No outbound calls recorded.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4">Provider</th>
                    <th className="py-2 pr-4">Calls</th>
                    <th className="py-2 pr-4">Errors</th>
                    <th className="py-2 pr-4">Retries</th>
                    <th className="py-2 pr-4">Avg Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {data.outbound_api_summary.map((row) => (
                    <tr key={row.provider} className="border-b">
                      <td className="py-2 pr-4">{row.provider}</td>
                      <td className="py-2 pr-4">{formatNumber(row.calls_last_15m)}</td>
                      <td className="py-2 pr-4 text-red-600">{formatNumber(row.error_count)}</td>
                      <td className="py-2 pr-4 text-amber-600">{formatNumber(row.retry_count)}</td>
                      <td className="py-2 pr-4">{formatNumber(row.avg_latency_ms)}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Provider Risk Signals</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center justify-between border rounded-lg px-4 py-3">
            <span>Worker online but not executing</span>
            <span className={data.provider_risk_signals.worker_online_but_not_executing ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
              {data.provider_risk_signals.worker_online_but_not_executing ? "TRUE" : "FALSE"}
            </span>
          </div>
          <div className="flex items-center justify-between border rounded-lg px-4 py-3">
            <span>Repeated worker restart detected</span>
            <span className={data.provider_risk_signals.repeated_worker_restart_detected ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
              {data.provider_risk_signals.repeated_worker_restart_detected ? "TRUE" : "FALSE"}
            </span>
          </div>
          <div className="flex items-center justify-between border rounded-lg px-4 py-3">
            <span>Log write failures detected</span>
            <span className={data.provider_risk_signals.log_write_failures_detected ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
              {data.provider_risk_signals.log_write_failures_detected ? "TRUE" : "FALSE"}
            </span>
          </div>
          <div className="flex items-center justify-between border rounded-lg px-4 py-3">
            <span>Task retries spiking</span>
            <span className={data.provider_risk_signals.task_retries_spiking ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
              {data.provider_risk_signals.task_retries_spiking ? "TRUE" : "FALSE"}
            </span>
          </div>
          <div className="flex items-center justify-between border rounded-lg px-4 py-3">
            <span>Outbound calls spiking</span>
            <span className={data.provider_risk_signals.outbound_calls_spiking ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
              {data.provider_risk_signals.outbound_calls_spiking ? "TRUE" : "FALSE"}
            </span>
          </div>
        </div>
        {data.data_quality_notes.length > 0 && (
          <div className="mt-4 text-xs text-gray-500">
            Data notes: {data.data_quality_notes.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

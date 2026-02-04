"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { getHRToken } from "@/lib/auth-hr";

type Position = {
  id: number;
  name: string;
  code?: string | null;
};

type RankingItem = {
  applicant_id: number;
  applicant_name: string;
  interview_score: number | null;
  interview_status: string;
  attempt_count: number | null;
  retake_status: string;
  application_date: string | null;
};

type RankingResponse = {
  position_id: number;
  position_name: string;
  rankings: RankingItem[];
};

const statusBadge = (status?: string | null) => {
  const key = (status || "").toUpperCase();
  if (key === "PASSED") return "bg-emerald-100 text-emerald-800";
  if (key === "FAILED") return "bg-rose-100 text-rose-800";
  if (key === "ON_HOLD") return "bg-amber-100 text-amber-800";
  if (key === "COMPLETED") return "bg-blue-100 text-blue-800";
  return "bg-gray-100 text-gray-700";
};

const formatScore = (value: number | null) => {
  if (value === null || value === undefined) return "Not available";
  return value.toFixed(2);
};

const formatDate = (value?: string | null) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
};

export default function ApplicantRankingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPosition = Number(searchParams.get("position") || "") || null;

  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(initialPosition);
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPositions = async () => {
      setLoadingPositions(true);
      setError("");
      try {
        const token = getHRToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await api.get<Position[]>("/positions/", { headers });
        const list = Array.isArray(response.data) ? response.data : [];
        setPositions(list);
      } catch (err: any) {
        setError(err.response?.data?.detail || "Failed to load positions.");
      } finally {
        setLoadingPositions(false);
      }
    };

    fetchPositions();
  }, []);

  useEffect(() => {
    if (!selectedPositionId && positions.length > 0) {
      const fallback = positions[0].id;
      setSelectedPositionId(fallback);
      router.replace(`/hr-dashboard/rankings?position=${fallback}`);
    }
  }, [positions, router, selectedPositionId]);

  useEffect(() => {
    if (!selectedPositionId) {
      setRankings([]);
      return;
    }

    const fetchRankings = async () => {
      setLoadingRankings(true);
      setError("");
      try {
        const token = getHRToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await api.get<RankingResponse>(`/positions/${selectedPositionId}/rankings/`, {
          headers,
        });
        const data = response.data;
        setRankings(Array.isArray(data?.rankings) ? data.rankings : []);
      } catch (err: any) {
        setError(err.response?.data?.detail || "Failed to load rankings.");
      } finally {
        setLoadingRankings(false);
      }
    };

    fetchRankings();
  }, [selectedPositionId]);

  const selectedPositionName = useMemo(() => {
    return positions.find((position) => position.id === selectedPositionId)?.name || "";
  }, [positions, selectedPositionId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Applicant Rankings</h1>
          <p className="text-gray-600 mt-1">Compare interview performance per position</p>
        </div>
        <div className="text-xs uppercase tracking-wide text-gray-500">HR View</div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Position</label>
            <select
              value={selectedPositionId ?? ""}
              onChange={(event) => {
                const nextId = Number(event.target.value) || null;
                setSelectedPositionId(nextId);
                if (nextId) {
                  router.replace(`/hr-dashboard/rankings?position=${nextId}`);
                }
              }}
              disabled={loadingPositions}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Select a position</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-600">
            <div className="font-medium text-gray-800">Current position</div>
            <div>{selectedPositionName || "Not selected"}</div>
          </div>
        </div>
        {loadingPositions && <p className="text-sm text-gray-500">Loading positions...</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Ranking Table</h2>
          {loadingRankings && <span className="text-sm text-gray-500">Loading rankings...</span>}
        </div>

        {rankings.length === 0 && !loadingRankings ? (
          <div className="text-center py-12 text-gray-500">
            {selectedPositionId ? "No data yet for this position." : "Select a position to view rankings."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applicant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Interview Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attempt Count</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Retake Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Application Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rankings.map((item, index) => {
                  const highlight =
                    index === 0
                      ? "bg-amber-50"
                      : index === 1
                      ? "bg-amber-50/70"
                      : index === 2
                      ? "bg-amber-50/40"
                      : "";
                  return (
                    <tr key={`${item.applicant_id}-${index}`} className={`transition-colors ${highlight}`}>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">#{index + 1}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {item.applicant_name || "Not available"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{formatScore(item.interview_score)}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusBadge(item.interview_status)}`}>
                          {item.interview_status || "Not available"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{item.attempt_count ?? "Not available"}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{item.retake_status || "Not available"}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{formatDate(item.application_date)}</td>
                      <td className="px-6 py-4 text-sm">
                        <Link
                          href={`/hr-dashboard/applicants/${item.applicant_id}`}
                          className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100"
                        >
                          View Profile
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

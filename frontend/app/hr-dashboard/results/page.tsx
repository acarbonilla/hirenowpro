"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { getHRToken } from "@/lib/auth-hr";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export default function HRResultsPage() {
  const router = useRouter();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ======================
  // Helper: Safe Normalize
  // ======================
  const normalize = (data: any) => {
    if (Array.isArray(data)) return data;
    if (data?.results) return data.results;
    return [];
  };

  // ======================
  // MAIN FETCH
  // Uses AbortController instead of axios timeout
  // ======================
  const fetchResults = async (silent = false) => {
    if (!silent) setLoading(true);

    const token = getHRToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const controller = new AbortController();

    try {
      const res = await axios.get(`${API_BASE_URL}/results/`, {
        headers,
        signal: controller.signal, // cancel-safe
      });

      const list = normalize(res.data);
      setResults(list);

      // Save to cache
      sessionStorage.setItem(
        "hr_results_cache",
        JSON.stringify({
          timestamp: Date.now(),
          results: list,
        })
      );
    } catch (err: any) {
      // Abort triggered by HMR or component unmount → ignore
      if (err.name === "CanceledError" || err.code === "ERR_CANCELED") return;

      console.error("Error fetching results:", err);

      if (err.response?.status === 401) {
        setError("Authentication required. Redirecting...");
        setTimeout(() => router.push("/hr-login"), 1500);
      } else if (err.response?.status === 403) {
        setError("Access denied.");
      } else {
        setError("Unable to load results.");
      }
    } finally {
      if (!silent) setLoading(false);
    }

    // Return cleanup for HMR
    return () => controller.abort();
  };

  // ======================
  // useEffect: Cache-first load
  // ======================
  useEffect(() => {
    const cache = sessionStorage.getItem("hr_results_cache");

    if (cache) {
      try {
        const parsed = JSON.parse(cache);
        if (parsed?.results) {
          // Instant UI
          setResults(parsed.results);
          setLoading(false);

          // Silent background refresh
          fetchResults(true);
          return;
        }
      } catch {}
    }

    // No cache → normal fetch
    fetchResults();
  }, []);

  // ======================
  // Render states
  // ======================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-10 h-10 rounded-full border-t-2 border-orange-500"></div>
      </div>
    );
  }

  if (error) {
    return <div className="flex items-center justify-center h-64 text-red-600 font-semibold">{error}</div>;
  }

  return (
    <div className="w-full min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Interview Results</h1>

      {results.length === 0 ? (
        <div className="text-center text-gray-500 py-10 text-lg">No interview results found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {results.map((item: any) => (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-all"
            >
              <h2 className="text-lg font-semibold text-gray-800">Interview #{item.interview}</h2>

              <div className="mt-3 space-y-1">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Score:</span> {item.overall_score ?? "N/A"}
                </p>
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Passed:</span>
                  {item.passed ? (
                    <span className="text-green-600 font-medium ml-1">Yes</span>
                  ) : (
                    <span className="text-red-600 font-medium ml-1">No</span>
                  )}
                </p>
              </div>

              <button
                onClick={() => router.push(`/hr-dashboard/results/${item.id}/review`)}
                className="mt-5 w-full py-2 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 transition-all"
              >
                View Details
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

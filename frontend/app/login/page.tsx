"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authAPI, interviewAPI, applicantAPI } from "@/lib/api";
import { useStore } from "@/store/useStore";

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentApplicant, setCurrentInterview } = useStore();
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check for position parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const position = params.get("position");
    if (position) {
      setSelectedPosition(position);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await authAPI.applicantLogin(formData);
      const tokens = response.data.tokens || { access: response.data.access, refresh: response.data.refresh };
      const user = response.data.user || response.data;

      // Store applicant tokens in localStorage
      localStorage.removeItem("hr_access");
      localStorage.removeItem("hr_refresh");
      localStorage.setItem("applicant_access", tokens.access);
      localStorage.setItem("applicant_refresh", tokens.refresh);
      localStorage.setItem("applicant_user", JSON.stringify(user));

      // If position is selected, create interview for this applicant
      if (selectedPosition && user.id) {
        try {
          // Get applicant details
          const applicantResponse = await applicantAPI.getApplicant(user.id);
          const applicant = applicantResponse.data;
          setCurrentApplicant(applicant);

          // Create interview
          const interviewResponse = await interviewAPI.create({
            applicant_id: user.id,
            position_type: selectedPosition,
          });
          const interview = interviewResponse.data;
          setCurrentInterview(interview);
          router.push(`/interview/${interview.id}`);
          return;
        } catch (error) {
          console.error("Failed to create interview:", error);
          // Fall back to dashboard if interview creation fails
        }
      }

      // Redirect to dashboard or home
      router.push("/dashboard");
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.response?.data?.detail || "Login failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-2xl">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Sign in to HireNowPro</h2>
          <p className="mt-2 text-center text-sm text-gray-600">HR Dashboard Login</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded relative">{error}</div>
          )}

          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={formData.username}
                onChange={handleChange}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter your password"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <a href="#" className="font-medium text-indigo-600 hover:text-indigo-500">
                Forgot your password?
              </a>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              For applicants:{" "}
              <a href="/" className="font-medium text-indigo-600 hover:text-indigo-500">
                Start Interview
              </a>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

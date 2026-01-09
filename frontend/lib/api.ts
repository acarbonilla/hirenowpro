import axios, { type AxiosRequestConfig } from "axios";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const publicAPI = axios.create({
  baseURL: `${API_BASE_URL}/public`,
  timeout: 10000,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // List of public endpoints that don't require auth
    // We use partial matching, so "/applicants/" matches "/api/applicants/"
    const publicEndpoints = [
      "/applicants/",
      "/auth/login/",
      "/auth/register/",
      "/interviews/",
      "/analysis/",
    ];

    const isPublic = config.url && publicEndpoints.some((endpoint) => config.url!.includes(endpoint));

    // Add auth token if available (prefer HR token for authenticated areas)
    if (typeof window !== "undefined" && !isPublic) {
      // Clean legacy keys to avoid conflicts
      localStorage.removeItem("access_token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("refresh_token");

      const hrToken = localStorage.getItem("hr_access");
      const applicantToken = localStorage.getItem("applicantToken") || localStorage.getItem("applicant_access");
      const token = hrToken || applicantToken || localStorage.getItem("authToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    console.log("REQUEST:", config.url, config.headers?.Authorization);
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle errors globally
    if (error.response?.status === 401) {
      // Only redirect to login if on admin/HR routes
      // Allow applicants to continue without authentication
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        // Only redirect to login if user is on HR/admin routes
        if (path.startsWith("/hr-dashboard") || path.startsWith("/admin")) {
          localStorage.removeItem("authToken");
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

// API endpoints
export const applicantAPI = {
  // Register new applicant
  register: (data: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    application_source?: string;
    latitude?: number | null;
    longitude?: number | null;
    applicant_lat?: number | null;
    applicant_lng?: number | null;
    is_onsite?: boolean;
    location_source?: string;
  }) => api.post("/applicants/", data),

  // Get applicant by ID
  getApplicant: (id: number) => api.get(`/applicants/${id}/`),
};

export const interviewAPI = {
  // Create new interview
  createInterview: (data: { applicant_id: number; interview_type: string; position_code: string }) => {
    const payload = {
      applicant_id: data.applicant_id,
      position_code: data.position_code,
      interview_type: data.interview_type,
    };
    return publicAPI.post("/interviews/", payload);
  },

  // Alias for createInterview
  create: (data: { applicant: number; interview_type?: string; position_type: number }) =>
    api.post("/interviews/", { ...data, interview_type: data.interview_type || "initial_ai" }),

  // Get interview details
  getInterview: (id: number, config?: AxiosRequestConfig) => publicAPI.get(`/interviews/${id}/`, config),

  // Upload video response (no immediate analysis)
  uploadVideoResponse: (interviewId: number, formData: FormData, config?: AxiosRequestConfig) => {
    return publicAPI.post(`/interviews/${interviewId}/video-response/`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...(config?.headers || {}),
      },
      timeout: 120000,
      ...config,
    });
  },

  // Submit interview for processing
  submitInterview: (id: number) => api.post(`/interviews/${id}/submit/`),

  // Complete interview
  completeInterview: (id: number) => api.post(`/interviews/${id}/complete/`),

  // List interviews
  listInterviews: (params?: any) => publicAPI.get("/interviews/", { params }),

  // Get interview analysis
  getAnalysis: (id: number) => api.get(`/interviews/${id}/analysis/`),
};

export { api, API_BASE_URL };

export const questionAPI = {
  // Get all active questions (with optional position and type filters)
  getQuestions: (interviewId: number) => publicAPI.get(`/interviews/${interviewId}/questions/`),

  // Get single question
  getQuestion: (id: number) => api.get(`/questions/${id}/`),
};

export const authAPI = {
  // Login
  login: (data: { username: string; password: string }) => api.post("/auth/login/", data),
  hrLogin: (data: { username: string; password: string }) => api.post("/auth/hr-login/", data),
  applicantLogin: (data: { username: string; password: string }) => api.post("/auth/applicant-login/", data),

  // Logout
  logout: (refreshToken: string) => api.post("/auth/logout/", { refresh_token: refreshToken }),

  // Register
  register: (data: {
    username: string;
    email: string;
    password: string;
    password_confirm: string;
    user_type?: string;
    first_name?: string;
    last_name?: string;
  }) => api.post("/auth/register/", data),

  // Refresh token
  refreshToken: (refreshToken: string) => api.post("/auth/token/refresh/", { refresh: refreshToken }),

  // Check authentication status
  checkAuth: () => api.get("/auth/check/"),

  // Get user profile
  getProfile: () => api.get("/auth/profile/"),

  // Update user profile
  updateProfile: (data: { first_name?: string; last_name?: string; email?: string }) =>
    api.patch("/auth/profile/", data),

  // Change password
  changePassword: (data: { old_password: string; new_password: string; new_password_confirm: string }) =>
    api.patch("/auth/change-password/", data),
};

export const settingsAPI = {
  // Get system settings
  getSettings: () => api.get("/settings/"),

  // Update system settings (HR/Admin only)
  updateSettings: (data: {
    passing_score_threshold?: number;
    review_score_threshold?: number;
    max_concurrent_interviews?: number;
    interview_expiry_days?: number;
    enable_script_detection?: boolean;
    enable_sentiment_analysis?: boolean;
  }) => api.put("/settings/1/", data),
};

export default api;

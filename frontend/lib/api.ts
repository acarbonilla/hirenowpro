import { apiClient, publicApi } from "@/lib/apiClient";

type RequestConfig = {
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  [key: string]: unknown;
};

apiClient.defaults.headers.common["Content-Type"] = "application/json";

// Request interceptor
apiClient.interceptors.request.use(
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

    // Add auth token if available (portal-aware)
    if (typeof window !== "undefined" && !isPublic) {
      // Clean legacy keys to avoid conflicts
      localStorage.removeItem("access_token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("refresh_token");

      const headers = config.headers as Record<string, any> | undefined;
      const portalHeader = headers?.["X-Portal"] || headers?.["x-portal"];
      const normalizedPortal = typeof portalHeader === "string" ? portalHeader.toUpperCase() : "";

      let token = "";
      if (normalizedPortal === "IT") {
        token = localStorage.getItem("it_access") || "";
      } else {
        const hrToken = localStorage.getItem("hr_access") || "";
        const applicantToken = localStorage.getItem("applicantToken") || localStorage.getItem("applicant_access") || "";
        token = hrToken || applicantToken || localStorage.getItem("authToken") || "";
      }

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
apiClient.interceptors.response.use(
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
  }) => apiClient.post("/applicants/", data),

  // Get applicant by ID
  getApplicant: (id: number) => apiClient.get(`/applicants/${id}/`),
};

export const interviewAPI = {
  // Create new interview
  createInterview: (data: { applicant_id: number; interview_type: string; position_code: string }) => {
    const payload = {
      applicant_id: data.applicant_id,
      position_code: data.position_code,
      interview_type: data.interview_type,
    };
    return publicApi.post("/interviews/", payload);
  },

  // Alias for createInterview
  create: (data: { applicant: number; interview_type?: string; position_type: number }) =>
    apiClient.post("/interviews/", { ...data, interview_type: data.interview_type || "initial_ai" }),

  // Get interview details
  getInterview: (publicId: string, config?: RequestConfig) => publicApi.get(`/interviews/${publicId}/`, config),

  // Upload video response (no immediate analysis)
  uploadVideoResponse: (publicId: string, formData: FormData, config?: RequestConfig) => {
    return publicApi.post(`/interviews/${publicId}/video-response/`, formData, {
      ...config,
      headers: {
        "Content-Type": "multipart/form-data",
        "X-Upload-No-Retry": "1",
        ...(config?.headers || {}),
      },
      timeout: 120000,
      "axios-retry": { retries: 0 },
    });
  },

  // Submit interview for processing
  submitInterview: (publicId: string) => publicApi.post(`/interviews/${publicId}/submit/`),

  // Complete interview
  completeInterview: (id: number) => apiClient.post(`/interviews/${id}/complete/`),

  // List interviews
  listInterviews: (params?: Record<string, unknown>) => publicApi.get("/interviews/", { params }),

  // Get interview analysis
  getAnalysis: (id: number) => apiClient.get(`/interviews/${id}/analysis/`),
};

export const publicAPI = publicApi;
export { apiClient as api };

export const questionAPI = {
  // Get all active questions (with optional position and type filters)
  getQuestions: (publicId: string) => publicApi.get(`/interviews/${publicId}/questions/`),

  // Get single question
  getQuestion: (id: number) => apiClient.get(`/questions/${id}/`),
};

export const authAPI = {
  // Login
  login: (data: { username: string; password: string }) => apiClient.post("/auth/login/", data),
  hrLogin: (data: { username: string; password: string }) => apiClient.post("/auth/hr-login/", data),
  applicantLogin: (data: { username: string; password: string }) => apiClient.post("/auth/applicant-login/", data),

  // Logout
  logout: (refreshToken: string) => apiClient.post("/auth/logout/", { refresh_token: refreshToken }),

  // Register
  register: (data: {
    username: string;
    email: string;
    password: string;
    password_confirm: string;
    user_type?: string;
    first_name?: string;
    last_name?: string;
  }) => apiClient.post("/auth/register/", data),

  // Refresh token
  refreshToken: (refreshToken: string) => apiClient.post("/auth/token/refresh/", { refresh: refreshToken }),

  // Check authentication status
  checkAuth: (config?: RequestConfig) => apiClient.get("/auth/check/", config),

  // Get user profile
  getProfile: () => apiClient.get("/auth/profile/"),

  // Update user profile
  updateProfile: (data: { first_name?: string; last_name?: string; email?: string }) =>
    apiClient.patch("/auth/profile/", data),

  // Change password
  changePassword: (data: { old_password: string; new_password: string; new_password_confirm: string }) =>
    apiClient.patch("/auth/change-password/", data),
};

export const settingsAPI = {
  // Get system settings
  getSettings: () => apiClient.get("/settings/"),

  // Update system settings (HR/Admin only)
  updateSettings: (data: {
    passing_score_threshold?: number;
    review_score_threshold?: number;
    max_concurrent_interviews?: number;
    interview_expiry_days?: number;
    enable_script_detection?: boolean;
    enable_sentiment_analysis?: boolean;
  }) => apiClient.put("/settings/1/", data),
};

export default apiClient;

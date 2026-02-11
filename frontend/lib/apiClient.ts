import axios from "axios";
import { API_BASE_URL } from "./apiBase";
import { getInterviewAccessToken, setInterviewAccessToken, setInterviewPublicId } from "@/lib/interviewAccess";

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

export const api = apiClient;

export const publicApi = axios.create({
  baseURL: `${API_BASE_URL}/api/public`,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

publicApi.interceptors.request.use((config) => {
  const token = getInterviewAccessToken();
  if (token) {
    config.headers = config.headers || {};
    if (!("Authorization" in config.headers)) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

publicApi.interceptors.response.use((response) => {
  const data = response?.data;
  if (data && typeof data === "object") {
    const token = (data as Record<string, unknown>).interview_token as string | undefined;
    const publicId =
      ((data as Record<string, unknown>).public_id as string | undefined) ||
      ((data as Record<string, any>)?.interview?.public_id as string | undefined);

    if (token) {
      setInterviewAccessToken(token);
    }
    if (publicId) {
      setInterviewPublicId(publicId);
    }
  }
  return response;
});

export const createApiClient = (config: Record<string, unknown> = {}) =>
  axios.create({
    baseURL: `${API_BASE_URL}/api`,
    headers: {
      "Content-Type": "application/json",
    },
    withCredentials: true,
    ...config,
  });

export const isCancel = axios.isCancel;

import axios from "axios";
import { getInterviewAccessToken, setInterviewAccessToken, setInterviewPublicId } from "@/lib/interviewAccess";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  withCredentials: true,
});

export const publicApi = axios.create({
  baseURL: `${BASE_URL}/api/public`,
  timeout: 10000,
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
    baseURL: `${BASE_URL}/api`,
    withCredentials: true,
    ...config,
  });

export const isCancel = axios.isCancel;

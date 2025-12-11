import axios from "axios";

/**
 * Applicant-scoped axios instance that injects applicant access token.
 */
export const applicantClient = () => {
  const token = typeof window !== "undefined" ? localStorage.getItem("applicant_access") : null;

  return axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

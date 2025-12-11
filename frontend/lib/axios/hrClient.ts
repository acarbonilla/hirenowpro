import axios from "axios";
import { getHRToken } from "../auth-hr";

/**
 * HR-scoped axios instance that always injects the HR access token.
 */
export const hrClient = () => {
  const token = getHRToken();

  return axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

export { getHRToken };

import axios from "axios";
import { API_BASE_URL } from "@/lib/apiBase";
import { getHRToken } from "../auth-hr";

/**
 * HR-scoped axios instance that always injects the HR access token.
 */
export const hrClient = () => {
  const token = getHRToken();

  return axios.create({
    baseURL: API_BASE_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

export { getHRToken };

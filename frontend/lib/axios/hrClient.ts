import { createApiClient } from "@/lib/apiClient";
import { getHRToken } from "../auth-hr";

/**
 * HR-scoped axios instance that always injects the HR access token.
 */
export const hrClient = () => {
  const token = getHRToken();

  return createApiClient({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

export { getHRToken };

/**
 * HR Authentication Helper Functions
 * Handles HR-specific authentication, token management, and role verification
 */

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  user_type: string;
  role?: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export const HR_USER_TYPES = new Set(["HR_MANAGER", "HR_RECRUITER", "ADMIN", "SUPERADMIN"]);
export const HR_MANAGER_USER_TYPES = new Set(["HR_MANAGER", "ADMIN", "SUPERADMIN"]);

const LEGACY_USER_TYPE_MAP: Record<string, string> = {
  applicant: "APPLICANT",
  hr_manager: "HR_MANAGER",
  hr_recruiter: "HR_RECRUITER",
  it_support: "IT_SUPPORT",
  admin: "ADMIN",
  superadmin: "SUPERADMIN",
  super_admin: "SUPERADMIN",
  hr_admin: "ADMIN",
  system_admin: "ADMIN",
  recruiter: "HR_RECRUITER",
};

export function normalizeUserType(value?: string) {
  const raw = (value || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  if (LEGACY_USER_TYPE_MAP[key]) {
    return LEGACY_USER_TYPE_MAP[key];
  }
  return raw.toUpperCase();
}

function clearLegacyTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("authToken");
  localStorage.removeItem("employee");
  localStorage.removeItem("hr_access");
  localStorage.removeItem("hr_refresh");
  localStorage.removeItem("hr_authToken");
  localStorage.removeItem("hr_refreshToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("refresh_token");
}

function isValidJwt(token: string | null): token is string {
  return !!token && token.split(".").length === 3;
}

/**
 * Store HR authentication tokens and user data
 */
export function setHRAuth(tokens: AuthTokens, user: User) {
  if (typeof window === "undefined") return;

  clearLegacyTokens();
  localStorage.setItem("hr_access", tokens.access);
  localStorage.setItem("hr_refresh", tokens.refresh);
  localStorage.setItem("hr_user", JSON.stringify(user));
}

/**
 * Get stored HR access token
 */
export function getHRToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("hr_access");
  if (!isValidJwt(token)) {
    clearHRAuth();
    return null;
  }
  return token;
}

/**
 * Get stored HR refresh token
 */
export function getHRRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("hr_refresh");
  return isValidJwt(token) ? token : null;
}

/**
 * Get stored HR user data
 */
export function getHRUser(): User | null {
  if (typeof window === "undefined") return null;

  const userStr = localStorage.getItem("hr_user");
  if (!userStr) return null;

  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * Check if user is authenticated as HR
 */
export function isHRAuthenticated(): boolean {
  const token = getHRToken();
  const user = getHRUser();
  return !!(token && user);
}

/**
 * Check if user has HR or admin role
 */
export function isHRRole(): boolean {
  const user = getHRUser();
  if (!user) return false;

  return HR_USER_TYPES.has(normalizeUserType(user.user_type));
}

/**
 * Check if user is HR Manager (can manage users)
 */
export function isHRManager(): boolean {
  const user = getHRUser();
  if (!user) return false;

  return HR_MANAGER_USER_TYPES.has(normalizeUserType(user.user_type));
}

/**
 * Clear HR authentication data
 */
export function clearHRAuth() {
  if (typeof window === "undefined") return;

  localStorage.removeItem("hr_access");
  localStorage.removeItem("hr_refresh");
  localStorage.removeItem("hr_user");
}

/**
 * Check if token is expired (basic check)
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const exp = payload.exp * 1000;
    return Date.now() >= exp;
  } catch {
    return true;
  }
}

/**
 * Redirect to HR login if not authenticated
 */
export function requireHRAuth(router: any) {
  if (!isHRAuthenticated() || !isHRRole()) {
    router.push("/hr-login");
    return false;
  }
  return true;
}

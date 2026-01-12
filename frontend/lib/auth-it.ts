/**
 * IT Authentication Helper Functions
 * Keeps IT auth state isolated from HR/applicant flows.
 */

export interface ITUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  user_type: string;
  role?: string;
}

export interface ITAuthTokens {
  access: string;
  refresh: string;
}

export function setITAuth(tokens: ITAuthTokens, user: ITUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem("it_access", tokens.access);
  localStorage.setItem("it_refresh", tokens.refresh);
  localStorage.setItem("it_user", JSON.stringify(user));
}

export function getITToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("it_access");
}

export function getITRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("it_refresh");
}

export function getITUser(): ITUser | null {
  if (typeof window === "undefined") return null;
  const userStr = localStorage.getItem("it_user");
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

export function clearITAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("it_access");
  localStorage.removeItem("it_refresh");
  localStorage.removeItem("it_user");
}

export function isITAuthenticated(): boolean {
  return !!(getITToken() && getITUser());
}

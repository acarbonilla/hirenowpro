const STORAGE_KEY = "interview_access_token";

export function getInterviewAccessToken(): string | null {
  if (typeof window === "undefined") return null;

  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) return stored;

  const params = new URLSearchParams(window.location.search);
  const token = params.get("t");
  if (token) {
    sessionStorage.setItem(STORAGE_KEY, token);
    return token;
  }

  return null;
}

export function setInterviewAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    sessionStorage.setItem(STORAGE_KEY, token);
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function clearInterviewAccessToken() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

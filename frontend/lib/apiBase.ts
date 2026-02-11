export const API_BASE_URL = (() => {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!base) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_API_BASE_URL is missing in production build.");
    }

    // Development fallback only
    return "http://localhost:8000";
  }

  return base.replace(/\/+$/, "");
})();

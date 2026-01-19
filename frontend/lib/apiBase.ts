export const API_BASE_URL = (() => {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  if (!base && typeof window !== "undefined") {
    console.error("NEXT_PUBLIC_API_BASE_URL is missing at runtime");
  }

  return base.replace(/\/+$/, "");
})();

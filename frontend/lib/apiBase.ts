const isProd = process.env.NODE_ENV === "production";

export const API_BASE_URL = (() => {
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (!isProd ? "http://localhost:8000/api" : "");

  if (isProd && !base) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required in production. Refusing to fall back."
    );
  }

  return base;
})();

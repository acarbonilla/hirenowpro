export const API_BASE_URL = (() => {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!base) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXT_PUBLIC_API_BASE_URL is REQUIRED in production builds"
      );
    }
    return "http://localhost:8000/api";
  }

  if (
    process.env.NODE_ENV === "production" &&
    /localhost|127\.0\.0\.1/.test(base)
  ) {
    throw new Error(
      "Production API base URL must not point to localhost"
    );
  }

  return base.replace(/\/$/, "");
})();

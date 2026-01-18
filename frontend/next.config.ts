import type { NextConfig } from "next";

function validateProductionApiBase() {
  const isProduction =
    process.env.DEPLOYMENT_ENV === "production" ||
    process.env.NODE_ENV === "production";

  if (isProduction) {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!base) {
      throw new Error("NEXT_PUBLIC_API_BASE_URL missing in production build");
    }
    if (/localhost|127\.0\.0\.1/.test(base)) {
      throw new Error("Invalid production API base URL: localhost detected");
    }
  }
}

validateProductionApiBase();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

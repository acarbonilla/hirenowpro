import type { NextConfig } from "next";

function validateProductionApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  const deploymentEnv = process.env.DEPLOYMENT_ENV;

  if (deploymentEnv === "production") {
    if (!apiBase) {
      throw new Error("Missing NEXT_PUBLIC_API_BASE_URL in production");
    }
    if (/localhost|127\.0\.0\.1/.test(apiBase)) {
      throw new Error("Invalid production API base URL: localhost detected");
    }
  }
}

validateProductionApiBase();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

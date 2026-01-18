import type { NextConfig } from "next";

const validateApiBaseUrl = () => {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const legacyBaseUrl = process.env.NEXT_PUBLIC_API_URL;
  const deploymentEnv = process.env.DEPLOYMENT_ENV;

  if (deploymentEnv === "production") {
    if (legacyBaseUrl) {
      throw new Error("NEXT_PUBLIC_API_URL is not allowed in production. Use NEXT_PUBLIC_API_BASE_URL.");
    }
    if (!baseUrl) {
      throw new Error("NEXT_PUBLIC_API_BASE_URL is required when DEPLOYMENT_ENV=production.");
    }

    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error(`NEXT_PUBLIC_API_BASE_URL must be an absolute URL. Received: "${baseUrl}"`);
    }

    if (parsed.protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_API_BASE_URL must use https in production.");
    }

    if (parsed.hostname !== "api.iais.online") {
      throw new Error(
        `NEXT_PUBLIC_API_BASE_URL must point to api.iais.online in production. Received: "${parsed.hostname}"`
      );
    }
  } else {
    if (!baseUrl && legacyBaseUrl) {
      console.warn("NEXT_PUBLIC_API_URL is deprecated. Use NEXT_PUBLIC_API_BASE_URL instead.");
    }
    if (!baseUrl && !legacyBaseUrl) {
      console.warn("NEXT_PUBLIC_API_BASE_URL is not set. Using dev fallback in runtime.");
    }
  }
};

validateApiBaseUrl();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

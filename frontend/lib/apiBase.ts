const RAW_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const LEGACY_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const deploymentEnv = process.env.DEPLOYMENT_ENV;
const isProductionDeployment = deploymentEnv === "production";
const DEV_FALLBACK_BASE_URL = "http://127.0.0.1:8000/api";

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const ensureAbsoluteUrl = (value: string) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`NEXT_PUBLIC_API_BASE_URL must be an absolute http(s) URL. Received: "${value}"`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`NEXT_PUBLIC_API_BASE_URL must use http or https. Received: "${value}"`);
  }
  return parsed;
};

const resolveApiBaseUrl = () => {
  if (isProductionDeployment && LEGACY_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not allowed in production. Use NEXT_PUBLIC_API_BASE_URL.");
  }

  if (RAW_BASE_URL) {
    return normalizeBaseUrl(RAW_BASE_URL);
  }

  if (!isProductionDeployment) {
    if (LEGACY_BASE_URL) {
      const normalized = normalizeBaseUrl(LEGACY_BASE_URL);
      if (typeof console !== "undefined") {
        console.warn(
          "NEXT_PUBLIC_API_URL is deprecated. Use NEXT_PUBLIC_API_BASE_URL instead.",
          { resolved: normalized }
        );
      }
      return normalized;
    }
    return DEV_FALLBACK_BASE_URL;
  }

  throw new Error(
    "NEXT_PUBLIC_API_BASE_URL is not defined. Set it to your backend URL (ex: https://api.iais.online/api)."
  );
};

const resolved = resolveApiBaseUrl();
const parsed = ensureAbsoluteUrl(resolved);

if (isProductionDeployment) {
  if (parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be https in production.");
  }
  if (parsed.hostname !== "api.iais.online") {
    throw new Error(
      `NEXT_PUBLIC_API_BASE_URL must point to api.iais.online in production. Received: "${parsed.hostname}"`
    );
  }
}

if (!isProductionDeployment && typeof console !== "undefined") {
  console.info("Resolved API base URL:", resolved);
}

export const API_BASE_URL = resolved;

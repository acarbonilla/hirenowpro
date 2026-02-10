import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

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

function collectHrApiPathMatches() {
  const roots = ["app", "lib", "services"].map((dir) => path.join(__dirname, dir));
  const matches: string[] = [];
  const hasHrApiPath = (line: string) =>
    line.includes("API_BASE_URL") && line.includes("/hr/") && !line.includes("/api/hr/");

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || (!fullPath.endsWith(".ts") && !fullPath.endsWith(".tsx"))) continue;
      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (hasHrApiPath(line)) {
          matches.push(`${fullPath}:${index + 1}`);
        }
      });
    }
  };

  roots.forEach(walk);
  return matches;
}

function guardHrApiPaths() {
  const matches = collectHrApiPathMatches();
  if (matches.length === 0) return;

  const isProdDeploy = process.env.DEPLOYMENT_ENV === "production";
  const isCI = process.env.CI === "true";
  const message = [
    "Found backend API paths using /hr/ without /api prefix.",
    "Update to /api/hr/... to avoid 404s.",
    "",
    ...matches,
  ].join("\n");

  if (isProdDeploy || isCI) {
    throw new Error(message);
  }

  console.warn(`[hr-api-guard] ${message}`);
}

validateProductionApiBase();
guardHrApiPaths();

const isProdDeploy =
  process.env.DEPLOYMENT_ENV === "production" || process.env.NODE_ENV === "production";

if (isProdDeploy) {
  // Enforce native SWC (no wasm fallback) for production SSR builds.
  process.env.NEXT_DISABLE_SWC_WASM = "1";

  // Turbopack is disabled for production builds. Use `next build --webpack`.
  if (process.env.TURBOPACK) {
    throw new Error(
      "[next-config] Turbopack is disabled in production. Use `next build --webpack` for SSR builds."
    );
  }
}

const nextConfig: NextConfig = {
  // SSR-only: static export is permanently disabled for runtime interview routes.
};

export default nextConfig;

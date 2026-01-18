import type { NextConfig } from "next";

if (process.env.NODE_ENV === "production") {
  if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_API_BASE_URL in production build.");
  }
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

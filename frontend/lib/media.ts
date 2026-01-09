const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export const resolveVideoUrl = (url?: string | null) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = API_BASE_URL.replace("/api", "");
  return `${base}${url}`;
};

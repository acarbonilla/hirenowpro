import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HireNowPro - AI-Powered Interview Platform",
  description: "AI-powered video interview platform for screening applicants",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">{children}</div>
      </body>
    </html>
  );
}

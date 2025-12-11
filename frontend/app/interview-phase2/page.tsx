"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InterviewPhase2Page() {
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("applicantToken") : null;
    if (!token) {
      router.push("/qr-invalid");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-lg shadow-lg text-center">
        <h1 className="text-2xl font-bold mb-2">Welcome to Phase 2 Interview</h1>
        <p className="text-gray-700">You are authenticated via QR. Continue your interview.</p>
      </div>
    </div>
  );
}

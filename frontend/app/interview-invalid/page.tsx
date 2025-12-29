"use client";

import { useRouter } from "next/navigation";

export default function InterviewInvalidPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md text-center max-w-md">
        <h1 className="text-2xl font-bold mb-2">Invalid Interview Link</h1>
        <p className="text-gray-700 mb-4">
          This interview link is invalid or no longer available. Please contact HR if you need a new link.
        </p>
        <button
          onClick={() => router.push("/register")}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Return to Registration
        </button>
      </div>
    </div>
  );
}

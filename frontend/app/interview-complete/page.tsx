"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, Mail, Home } from "lucide-react";

export default function InterviewCompletePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const interviewId = searchParams?.get("id") ?? null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600 px-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8 md:p-10 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center shadow-lg">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
        </div>

        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3">You&apos;re all done!</h1>

        <p className="text-lg text-gray-700 mb-6">
          Your interview{interviewId ? ` #${interviewId}` : ""} has been submitted successfully. Our system will analyze
          your responses in the background.
        </p>

        <div className="bg-blue-50 rounded-2xl p-5 mb-6 text-left">
          <p className="font-semibold text-blue-900 mb-1">No need to wait here</p>
          <p className="text-blue-900/80 text-sm">
            Analysis runs in the background and can take a little while. You can close this page; we&apos;ll handle the
            rest and the hiring team will review your results.
          </p>
        </div>

        <div className="bg-green-50 rounded-2xl p-5 mb-6 text-left flex items-start space-x-3">
          <Mail className="w-6 h-6 text-green-600 mt-1" />
          <div>
            <p className="font-semibold text-green-900 mb-1">What happens next</p>
            <p className="text-green-900/80 text-sm">
              We process your answers for the hiring team. If they need anything else, they&apos;ll reach out by email or
              in your applicant portal.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-4">
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold shadow-md hover:bg-blue-700 transition-colors w-full sm:w-auto"
          >
            <Home className="w-5 h-5 mr-2" />
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

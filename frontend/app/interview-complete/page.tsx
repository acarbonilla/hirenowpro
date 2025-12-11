"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle, Mail, Clock, Home } from "lucide-react";

const MESSAGES = [
  "Analyzing your communication skills...",
  "Reviewing your responses for key strengths...",
  "Summarizing your interview for HR...",
  "Finalizing your interview report...",
];

export default function InterviewCompletePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const interviewId = searchParams?.get("id") ?? null;

  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600 px-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8 md:p-10 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center shadow-lg">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
        </div>

        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3">You&apos;re all done! 🎉</h1>

        <p className="text-lg text-gray-700 mb-6">
          Thanks for completing your AI interview
          {interviewId ? ` #${interviewId}` : ""}. We&apos;re now processing your responses.
        </p>

        <div className="bg-blue-50 rounded-2xl p-5 mb-6 text-left flex items-start space-x-3">
          <Clock className="w-6 h-6 text-blue-500 mt-1" />
          <div>
            <p className="font-semibold text-blue-900 mb-1">What&apos;s happening now</p>
            <p className="text-blue-900/80 mb-1">{MESSAGES[messageIndex]}</p>
            <p className="text-blue-900/70 text-sm">
              Our system is preparing a report for the HR team. You don&apos;t need to wait here or keep this page open.
            </p>
          </div>
        </div>

        <div className="bg-yellow-50 rounded-2xl p-5 mb-6 text-left flex items-start space-x-3">
          <Mail className="w-6 h-6 text-yellow-500 mt-1" />
          <div>
            <p className="font-semibold text-yellow-900 mb-1">We&apos;ll let you know</p>
            <p className="text-yellow-900/80 text-sm">
              HR will review your results once the analysis is complete. You may receive an email or see updates in your
              application portal.
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

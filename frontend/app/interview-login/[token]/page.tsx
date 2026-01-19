"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/apiClient";

export default function InterviewMagicLoginPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [message, setMessage] = useState("Validating link...");
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const validate = async () => {
      try {
        // Call backend directly to avoid Next.js /api 308 redirects aborting the XHR.
        const res = await api.get(`/applicant/magic-login/${token}/`, {
          validateStatus: () => true,
        });
        if (res.status === 200 && res.data?.valid && res.data?.token) {
          localStorage.setItem("applicantToken", res.data.token);
          setStatus("success");
          setMessage("Login successful. Redirecting...");
          const interviewId = res.data.interview_id || res.data.id;
          if (!interviewId && !res.data.redirect_url) {
            setStatus("error");
            setMessage("Invalid or unavailable interview link.");
            setResolved(true);
            return;
          }
          const redirectUrl = res.data.redirect_url || `/interview/${interviewId}`;
          setResolved(true);
          setTimeout(() => router.push(redirectUrl), 800);
        } else if (res.status === 410) {
          setStatus("error");
          setMessage("This interview link has expired.");
          setResolved(true);
          router.push("/interview-expired");
        } else if (res.status === 409) {
          setStatus("error");
          setMessage("This interview has already been completed and submitted.");
          setResolved(true);
          router.push("/interview-submitted");
        } else if (res.status === 401 || res.status === 404) {
          setStatus("error");
          setMessage("Invalid interview link.");
          setResolved(true);
          router.push("/interview-invalid");
        } else {
          setStatus("error");
          setMessage("Invalid or unavailable interview link.");
          setResolved(true);
        }
      } catch (err: any) {
        setStatus("error");
        setMessage("Invalid or unavailable interview link.");
        setResolved(true);
      }
    };
    validate();
  }, [router, token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white shadow-md rounded-lg p-8 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-3">Interview Login</h1>
        <p className="text-gray-700">{message}</p>
        {status === "loading" && <p className="text-sm text-gray-500 mt-2">Please wait...</p>}
        {resolved && status === "error" && (
          <button
            onClick={() => router.push("/register?expired=true")}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Return to Registration
          </button>
        )}
      </div>
    </div>
  );
}

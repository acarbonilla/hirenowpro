"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import axios from "axios";

export default function InterviewMagicLoginPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [message, setMessage] = useState("Validating link...");

  useEffect(() => {
    const validate = async () => {
      try {
        const res = await axios.get(`/api/applicant/magic-login/${token}/`);
        if (res.data?.valid && res.data?.token) {
          localStorage.setItem("applicantToken", res.data.token);
          setStatus("success");
          setMessage("Login successful. Redirecting...");
          const interviewId = res.data.interview_id || res.data.id;
          if (!interviewId && !res.data.redirect_url) {
            setStatus("error");
            setMessage("Interview link invalid. Request a new one.");
            router.push("/interview-expired");
            return;
          }
          const redirectUrl = res.data.redirect_url || `/interview/${interviewId}`;
          setTimeout(() => router.push(redirectUrl), 800);
        } else {
          setStatus("error");
          setMessage("Link expired. Request a new one.");
          router.push("/interview-expired");
        }
      } catch (err: any) {
        setStatus("error");
        setMessage("Link expired or invalid. Request a new one.");
        router.push("/interview-expired");
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
        {status === "error" && (
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

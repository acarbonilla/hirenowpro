"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import axios from "axios";
import { API_BASE_URL } from "@/lib/apiBase";

export default function QRLoginPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [message, setMessage] = useState("Validating QR link...");

  useEffect(() => {
    const validate = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/applicant/qr-login/${token}/`);
        if (res.data?.valid && res.data?.token) {
          localStorage.setItem("applicantToken", res.data.token);
          setStatus("success");
          setMessage("Login successful. Redirecting...");
          const redirectUrl = `/interview-phase2`;
          setTimeout(() => router.push(redirectUrl), 800);
        } else {
          setStatus("error");
          setMessage("Your QR code has expired or is no longer valid.");
        }
      } catch (err: any) {
        setStatus("error");
        setMessage("Your QR code has expired or is no longer valid.");
      }
    };
    validate();
  }, [router, token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white shadow-md rounded-lg p-8 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-3">QR Interview Login</h1>
        <p className="text-gray-700">{message}</p>
        {status === "error" && (
          <button
            onClick={() => router.push("/qr-invalid")}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Return
          </button>
        )}
      </div>
    </div>
  );
}

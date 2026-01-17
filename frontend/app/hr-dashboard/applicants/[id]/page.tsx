"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import axios from "axios";
import { getHRToken } from "@/lib/auth-hr";
import { API_BASE_URL } from "@/lib/apiBase";

export default function ApplicantDetailPage() {
  const router = useRouter();
  const params = useParams();
  const applicantId = params.id as string;

  const [link, setLink] = useState<string | null>(null);
  const [qrData, setQrData] = useState<{ url: string; qr_image?: string; expires_at?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [interviewId, setInterviewId] = useState<number | null>(null);
  const [interviewStatus, setInterviewStatus] = useState<string | null>(null);
  const [interviewDecision, setInterviewDecision] = useState<string | null>(null);
  const [interview, setInterview] = useState<{ status?: string | null; is_archived?: boolean | null; archived?: boolean | null } | null>(null);
  const [activeRetakeExists, setActiveRetakeExists] = useState(false);

  const normalizeStatus = (value?: string | null) => (value || "").trim().toUpperCase();

  const loadLatestInterview = async () => {
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_BASE_URL}/interviews/`, {
        headers,
        params: { applicant_id: applicantId, page_size: 5 },
      });
      const results = res.data?.results || [];
      const latest = Array.isArray(results) && results.length > 0 ? results[0] : null;
      const hasActiveRetake = Array.isArray(results)
        ? results.some((item: any) => {
            const status = normalizeStatus(item?.status);
            return item?.is_retake === true && item?.is_archived !== true && item?.archived !== true
              && (status === "PENDING" || status === "IN_PROGRESS");
          })
        : false;
      setInterview(latest ?? null);
      setInterviewId(latest?.id ?? null);
      setInterviewStatus(latest?.status ?? null);
      setInterviewDecision(latest?.hr_decision ?? null);
      setActiveRetakeExists(hasActiveRetake);
    } catch (err: any) {
      setInterview(null);
      setInterviewId(null);
      setInterviewStatus(null);
      setInterviewDecision(null);
      setActiveRetakeExists(false);
    }
  };

  useEffect(() => {
    loadLatestInterview();
  }, [applicantId]);

  const interviewArchived =
    interview?.status === "ARCHIVED" || interview?.is_archived === true || interview?.archived === true;

  const getRetakeStatus = () => {
    if (interviewArchived) return "ARCHIVED";

    const decision = normalizeStatus(interviewDecision);
    if (decision === "HOLD" || decision === "ON_HOLD") return "ON_HOLD";
    if (decision === "REJECT" || decision === "REJECTED" || decision === "FAILED") return "FAILED";

    return "DISABLED";
  };

  const retakeStatus = getRetakeStatus();
  const retakeEnabled = !activeRetakeExists && ["FAILED", "ON_HOLD"].includes(retakeStatus);
  const retakeDisabledMessage =
    activeRetakeExists
      ? "An active retake already exists for this applicant."
      : retakeStatus === "ARCHIVED"
      ? "This interview is archived. Retakes require creating a new interview."
      : "Retake is available only for failed or on-hold interviews.";

  const resendLink = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(`${API_BASE_URL}/hr/applicant/${applicantId}/resend-link/`, null, { headers });
      setLink(res.data?.url);
      setSuccess("Interview link resent.");
      await loadLatestInterview();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to resend link");
    } finally {
      setLoading(false);
    }
  };

  const generateQR = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(`${API_BASE_URL}/hr/applicant/${applicantId}/generate-qr/`, null, { headers });
      setQrData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to generate QR");
    } finally {
      setLoading(false);
    }
  };

  const resendQR = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(`${API_BASE_URL}/hr/applicant/${applicantId}/resend-qr/`, null, { headers });
      setQrData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to resend QR");
    } finally {
      setLoading(false);
    }
  };

  const allowRetake = async () => {
    if (!interviewId) {
      setError("No interview found for retake.");
      return;
    }
    if (!retakeEnabled) {
      return;
    }
    const reason = window.prompt("Retake approval reason (optional):") || "";
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(
        `${API_BASE_URL}/interviews/${interviewId}/allow-retake/`,
        { reason },
        { headers }
      );
      setSuccess(res.data?.message || "Retake interview created and email sent to applicant.");
      await loadLatestInterview();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to allow retake");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Applicant {applicantId}</h1>
      {interviewStatus === "in_progress" && (
        <button
          onClick={resendLink}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition"
        >
          {loading ? "Sending..." : "Resend Interview Link"}
        </button>
      )}
      <button
        onClick={allowRetake}
        disabled={loading || !retakeEnabled}
        title={!retakeEnabled ? "Retake is unavailable for this interview." : undefined}
        className="ml-3 px-4 py-2 bg-rose-600 text-white rounded hover:bg-rose-700 transition"
      >
        {loading ? "Processing..." : "Allow Retake"}
      </button>
      {!retakeEnabled && (
        <p className="mt-2 text-sm text-gray-600">{retakeDisabledMessage}</p>
      )}
      <button
        onClick={generateQR}
        disabled={loading}
        className="ml-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
      >
        {loading ? "Generating..." : "Generate QR for Interview"}
      </button>
      <button
        onClick={resendQR}
        disabled={loading}
        className="ml-3 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
      >
        {loading ? "Resending..." : "Resend QR Invite"}
      </button>
      {link && (
        <div className="mt-4">
          <p className="text-sm text-gray-700">Magic Link:</p>
          <div className="bg-gray-100 p-3 rounded mt-2 text-sm break-all">{link}</div>
        </div>
      )}
      {qrData && (
        <div className="mt-4">
          <p className="text-sm text-gray-700">QR Login URL:</p>
          <div className="bg-gray-100 p-3 rounded mt-2 text-sm break-all">{qrData.url}</div>
          {qrData.expires_at && <p className="text-xs text-gray-500 mt-1">Expires at: {qrData.expires_at}</p>}
          {qrData.qr_image && (
            <div className="mt-3">
              <img
                src={`data:image/png;base64,${qrData.qr_image}`}
                alt="QR Code"
                className="mx-auto w-40 h-40 border rounded"
              />
            </div>
          )}
        </div>
      )}
      {success && <p className="text-green-600 mt-3 text-sm">{success}</p>}
      {error && <p className="text-red-600 mt-3 text-sm">{error}</p>}
    </div>
  );
}

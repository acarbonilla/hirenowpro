"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getHRToken } from "@/lib/auth-hr";
import { api } from "@/lib/apiClient";

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
      const res = await api.get("/interviews/", {
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

  const formatDate = (value?: string | null) => {
    if (!value) return "Not available";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };

  const formatStatus = (value?: string | null) => {
    if (!value) return "Not available";
    return normalizeStatus(value).replace(/_/g, " ");
  };

  const formatText = (value?: string | null) => {
    if (!value) return "Not available";
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "Not available";
  };

  const interviewCreatedAt = (interview as any)?.created_at as string | undefined;
  const interviewCompletedAt = (interview as any)?.completed_at as string | undefined;
  const interviewAttemptCount = (interview as any)?.attempt_count as number | undefined;
  const applicantRecord = (interview as any)?.applicant as
    | {
        full_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        phone?: string | null;
        position_applied?: string | null;
        created_at?: string | null;
      }
    | undefined;
  const applicantFullName =
    (interview as any)?.applicant_full_name ||
    (interview as any)?.applicant_name ||
    applicantRecord?.full_name ||
    [applicantRecord?.first_name, applicantRecord?.last_name].filter(Boolean).join(" ") ||
    null;
  const applicantEmail =
    (interview as any)?.applicant_email || applicantRecord?.email || null;
  const applicantPhone =
    (interview as any)?.applicant_phone || applicantRecord?.phone || null;
  const applicantPosition =
    (interview as any)?.applicant_position_applied || applicantRecord?.position_applied || null;
  const applicantApplicationDate =
    (interview as any)?.applicant_created_at || applicantRecord?.created_at || null;
  const statusForEligibility = normalizeStatus(interviewStatus);
  const retakeEligibilityLabel = interviewStatus
    ? statusForEligibility === "FAILED" || statusForEligibility === "ON_HOLD"
      ? "Eligible"
      : "Not eligible"
    : "Not available";

  const resendLink = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await api.post(`/hr/applicant/${applicantId}/resend-link/`, null, { headers });
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
      const res = await api.post(`/hr/applicant/${applicantId}/generate-qr/`, null, { headers });
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
      const res = await api.post(`/hr/applicant/${applicantId}/resend-qr/`, null, { headers });
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
      const res = await api.post(
        `/interviews/${interviewId}/allow-retake/`,
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
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Applicant Profile</h1>
          <p className="text-sm text-gray-600">Applicant ID: {applicantId}</p>
        </div>
        <div className="text-xs uppercase tracking-wide text-gray-500">HR View</div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Applicant Profile</h2>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                {formatStatus(interviewStatus)}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Full Name</p>
                <p className="text-sm text-gray-900">{formatText(applicantFullName)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Email Address</p>
                <p className="text-sm text-gray-900">{formatText(applicantEmail)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Phone Number</p>
                <p className="text-sm text-gray-900">{formatText(applicantPhone)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Position Applied</p>
                <p className="text-sm text-gray-900">{formatText(applicantPosition)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Application Date</p>
                <p className="text-sm text-gray-900">{formatDate(applicantApplicationDate || interviewCreatedAt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Interview Attempt Count</p>
                <p className="text-sm text-gray-900">{interviewAttemptCount ?? "Not available"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Retake Eligibility</p>
                <p className="text-sm text-gray-900">{retakeEligibilityLabel}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Retake Status</p>
                <p className="text-sm text-gray-900">{formatStatus(retakeStatus)}</p>
              </div>
            </div>
            {!retakeEnabled && (
              <p className="mt-4 rounded-md bg-gray-50 p-3 text-xs text-gray-600">{retakeDisabledMessage}</p>
            )}
          </div>

          {link && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Magic Link</p>
              <div className="mt-2 break-all rounded bg-gray-100 p-3 text-sm">{link}</div>
            </div>
          )}

          {qrData && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">QR Login URL</p>
              <div className="mt-2 break-all rounded bg-gray-100 p-3 text-sm">{qrData.url}</div>
              {qrData.expires_at && (
                <p className="mt-2 text-xs text-gray-500">Expires at: {qrData.expires_at}</p>
              )}
              {qrData.qr_image && (
                <div className="mt-4">
                  <img
                    src={`data:image/png;base64,${qrData.qr_image}`}
                    alt="QR Code"
                    className="mx-auto h-40 w-40 rounded border"
                  />
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Actions</h2>
            <div className="mt-4 flex flex-wrap gap-3">
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
                className="px-4 py-2 bg-rose-600 text-white rounded hover:bg-rose-700 transition"
              >
                {loading ? "Processing..." : "Allow Retake"}
              </button>
              <button
                onClick={generateQR}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                {loading ? "Generating..." : "Generate QR for Interview"}
              </button>
              <button
                onClick={resendQR}
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
              >
                {loading ? "Resending..." : "Resend QR Invite"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Interview Summary</h2>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Last Interview Date</p>
                <p>{formatDate(interviewCompletedAt || interviewCreatedAt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Interview Result</p>
                <p>{formatStatus(interviewDecision)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Interview Validity</p>
                <p>{interviewArchived ? "Archived" : "Active"}</p>
              </div>
            </div>
          </div>

          {success && <p className="text-sm text-green-600">{success}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </aside>
      </div>
    </div>
  );
}

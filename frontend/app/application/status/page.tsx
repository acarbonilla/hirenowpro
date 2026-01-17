'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from "axios";
import { API_BASE_URL } from "@/lib/apiBase";


export default function ApplicationStatusPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reapplyDate, setReapplyDate] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const token = localStorage.getItem('applicantToken');
        if (!token) {
          setMessage('No active application found.');
          setLoading(false);
          return;
        }

        const res = await axios.get(`${API_BASE_URL}/applicants/me/status/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setStatus(res.data.status || null);
        setMessage(res.data.message || 'Your application is being processed.');
        setReapplyDate(res.data.reapplication_date || null);
      } catch (err) {
        setMessage('We could not retrieve your application status at this time.');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  if (loading) {
    return <div className="p-8 text-center">Loading application status...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow p-6 text-center space-y-4">
        <h1 className="text-2xl font-bold mb-2">Application Status</h1>

        <p className="text-gray-600 mb-4">
          Thank you for applying. Below is the current status of your application.
        </p>

        <p className="text-gray-800 mb-4">
          {message || 'Your application is being processed.'}
        </p>

        {status && (
          <div className="inline-flex items-center justify-center px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-700">
            {status}
          </div>
        )}

        {reapplyDate && (
          <p className="text-sm text-gray-600">
            You may reapply on <strong>{reapplyDate}</strong>
          </p>
        )}

        <div className="mt-6">
          <Link
            href="/"
            className="inline-block px-6 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 transition"
          >
            Return to Home
          </Link>
        </div>

        <div className="border-t pt-4 mt-4">
          <p className="text-sm text-gray-500">
            Please do not submit multiple applications using the same email.
            Our team will contact you once a decision has been made.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { interviewAPI } from "@/lib/api";
import { Loader2, CheckCircle, Clock, AlertCircle } from "lucide-react";

export default function ProcessingPage() {
  const router = useRouter();
  const params = useParams();
  const interviewId = params.id as string;

  const [status, setStatus] = useState<"processing" | "completed" | "failed">("processing");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [message, setMessage] = useState("Processing your interview responses...");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Timer for elapsed time
    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);

      // Update progress (simulate - reaches ~80% in 5 minutes)
      setProgress((prev) => {
        if (prev < 80) return prev + 0.27; // ~80% in 300 seconds
        return prev;
      });
    }, 1000);

    // Check processing status every 10 seconds
    const checkStatus = async () => {
      try {
        const response = await interviewAPI.getInterview(parseInt(interviewId));
        const interview = response.data.interview || response.data;

        console.log("Interview status:", interview.status);

        if (interview.status === "completed") {
          setStatus("completed");
          setProgress(100);
          setMessage("Interview analysis completed!");

          // Redirect to results after 2 seconds
          setTimeout(() => {
            router.push(`/results/${interviewId}`);
          }, 2000);

          clearInterval(statusCheckInterval);
          clearInterval(interval);
        } else if (interview.status === "failed") {
          setStatus("failed");
          setMessage("An error occurred during processing. Please contact support.");
          clearInterval(statusCheckInterval);
          clearInterval(interval);
        }
      } catch (error) {
        console.error("Error checking status:", error);
      }
    };

    // Check immediately and then every 10 seconds
    const statusCheckInterval = setInterval(checkStatus, 10000);
    checkStatus();

    // Cleanup
    return () => {
      if (interval) clearInterval(interval);
      if (statusCheckInterval) clearInterval(statusCheckInterval);
    };
  }, [interviewId, router]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8 md:p-12">
        {/* Status Icon */}
        <div className="flex justify-center mb-8">
          {status === "processing" && (
            <div className="relative">
              <Loader2 className="w-24 h-24 text-blue-600 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Clock className="w-10 h-10 text-blue-400" />
              </div>
            </div>
          )}
          {status === "completed" && (
            <div className="bg-green-100 rounded-full p-6">
              <CheckCircle className="w-24 h-24 text-green-600" />
            </div>
          )}
          {status === "failed" && (
            <div className="bg-red-100 rounded-full p-6">
              <AlertCircle className="w-24 h-24 text-red-600" />
            </div>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-center mb-4">
          {status === "processing" && "Analyzing Your Interview"}
          {status === "completed" && "Analysis Complete!"}
          {status === "failed" && "Processing Failed"}
        </h1>

        {/* Message */}
        <p className="text-center text-gray-600 text-lg mb-8">{message}</p>

        {/* Progress Bar */}
        {status === "processing" && (
          <>
            <div className="w-full bg-gray-200 rounded-full h-4 mb-4 overflow-hidden">
              <div
                className="bg-linear-to-r from-blue-500 to-indigo-600 h-4 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-sm text-gray-500 mb-8">{Math.round(progress)}% complete</p>
          </>
        )}

        {/* Timer */}
        <div className="bg-blue-50 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-center space-x-4">
            <Clock className="w-6 h-6 text-blue-600" />
            <div>
              <p className="text-sm text-gray-600">Elapsed Time</p>
              <p className="text-2xl font-mono font-bold text-blue-600">{formatTime(elapsedTime)}</p>
            </div>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="bg-linear-to-br from-blue-50 to-blue-100 rounded-lg p-4 text-center">
            <div className="text-blue-600 font-semibold mb-1">AI Analysis</div>
            <div className="text-sm text-gray-600">Evaluating responses</div>
          </div>
          <div className="bg-linear-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 text-center">
            <div className="text-indigo-600 font-semibold mb-1">Video Processing</div>
            <div className="text-sm text-gray-600">Analyzing behavior</div>
          </div>
          <div className="bg-linear-to-br from-purple-50 to-purple-100 rounded-lg p-4 text-center">
            <div className="text-purple-600 font-semibold mb-1">Scoring</div>
            <div className="text-sm text-gray-600">Generating results</div>
          </div>
        </div>

        {/* Additional Info */}
        {status === "processing" && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800 text-center">
              <strong>Please wait 5-10 minutes.</strong> Our AI is analyzing your video responses, evaluating your
              answers, and generating your personalized report. You'll be automatically redirected when complete.
            </p>
          </div>
        )}

        {status === "completed" && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800 text-center">Redirecting to your results page...</p>
          </div>
        )}

        {status === "failed" && (
          <div className="text-center">
            <button
              onClick={() => router.push("/")}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Return to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

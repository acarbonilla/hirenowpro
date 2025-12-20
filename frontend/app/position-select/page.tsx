"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { interviewAPI, publicAPI } from "@/lib/api";
import { useStore } from "@/store/useStore";
import { Briefcase, Headphones, Monitor, TrendingUp, Users, Info, ArrowRight, Loader2 } from "lucide-react";

interface Position {
  code: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  skills: string[];
  color: string;
}

const positions: Position[] = [
  {
    code: "virtual_assistant",
    title: "Virtual Assistant",
    description:
      "Provide remote administrative support including calendar management, email handling, scheduling, and document organization.",
    icon: <Briefcase className="w-8 h-8" />,
    skills: [
      "Calendar Management",
      "Email Handling",
      "Task Prioritization",
      "Document Management",
      "Remote Communication",
    ],
    color: "from-blue-500 to-blue-600",
  },
  {
    code: "customer_service",
    title: "Customer Service",
    description:
      "Assist customers with inquiries, resolve issues, provide product information, and ensure customer satisfaction.",
    icon: <Headphones className="w-8 h-8" />,
    skills: ["Customer Support", "Problem Resolution", "CRM Systems", "Communication", "Patience"],
    color: "from-green-500 to-green-600",
  },
  {
    code: "it_support",
    title: "IT Support",
    description:
      "Provide technical assistance, troubleshoot hardware and software issues, and support end-users with technology needs.",
    icon: <Monitor className="w-8 h-8" />,
    skills: [
      "Technical Troubleshooting",
      "Hardware/Software Support",
      "Operating Systems",
      "Ticket Management",
      "Remote Support",
    ],
    color: "from-purple-500 to-purple-600",
  },
  {
    code: "sales_marketing",
    title: "Sales and Marketing",
    description:
      "Drive sales growth, develop marketing campaigns, manage leads, and build customer relationships to achieve revenue targets.",
    icon: <TrendingUp className="w-8 h-8" />,
    skills: ["Sales Strategy", "Lead Generation", "Digital Marketing", "Campaign Management", "Customer Relations"],
    color: "from-orange-500 to-orange-600",
  },
  {
    code: "general",
    title: "General Position",
    description:
      "Open application for various roles. Interview will include general questions applicable to multiple positions.",
    icon: <Users className="w-8 h-8" />,
    skills: ["Adaptability", "Communication", "Problem Solving", "Time Management", "Teamwork"],
    color: "from-gray-500 to-gray-600",
  },
];

function PositionSelectPageInner() {
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [hoveredPosition, setHoveredPosition] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();
  const { currentApplicant, setCurrentInterview } = useStore();

  useEffect(() => {
    if (!currentApplicant) {
      router.push("/register");
    }
  }, [currentApplicant, router]);

  const handleSelectPosition = (positionCode: string) => {
    setError("");
    setSelectedPosition(positionCode);
  };

  const handleSubmit = async () => {
    if (!selectedPosition) {
      setError("Please select a position to continue");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const appId = currentApplicant?.id;

      if (!appId) {
        throw new Error("Applicant ID not found");
      }

      // Create interview for the applicant with position type
      const posRes = await publicAPI.get("/position-types/", { params: { position_code: selectedPosition } });
      const first = posRes.data?.results?.[0] || posRes.data?.[0];
      const positionTypeId = first?.id;
      if (!positionTypeId) throw new Error("Position type not found");

      const interviewResponse = await interviewAPI.createInterview({
        applicant_id: appId,
        interview_type: "initial_ai",
        position_code: selectedPosition,
      });
      const interview = interviewResponse.data.interview || interviewResponse.data;
      if (!interview?.id) {
        throw new Error("Interview ID missing from response");
      }

      setCurrentInterview(interview);

      // Store selected position in localStorage for fetching questions
      localStorage.setItem("selected_position", selectedPosition);

      // Redirect to interview page
      router.push(`/interview/${interview.id}`);
    } catch (error: any) {
      console.error("Error creating interview:", error);
      setError(error.response?.data?.message || error.message || "Failed to create interview. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Select Your Position</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Choose the position you're applying for. Each position has tailored interview questions to assess your
            specific skills.
          </p>
        </div>

        {/* Geofence status */}
        {currentApplicant?.geo_status && (
          <div className="max-w-3xl mx-auto mb-8 p-4 rounded-lg border bg-white shadow-sm">
            {currentApplicant.geo_status === "onsite" && (
              <p className="text-green-700 text-sm font-medium">You applied from an approved location.</p>
            )}
            {currentApplicant.geo_status === "offsite" && (
              <p className="text-amber-700 text-sm font-medium">Your location is outside the office radius.</p>
            )}
            {currentApplicant.geo_status === "unknown" && (
              <p className="text-blue-700 text-sm font-medium">Location unavailable; application marked as online.</p>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="max-w-3xl mx-auto mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Position Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {positions.map((position) => (
            <div
              key={position.code}
              onClick={() => handleSelectPosition(position.code)}
              onMouseEnter={() => setHoveredPosition(position.code)}
              onMouseLeave={() => setHoveredPosition(null)}
              className={`
                relative bg-white rounded-xl shadow-lg p-6 cursor-pointer transition-all duration-300
                ${
                  selectedPosition === position.code
                    ? "ring-4 ring-blue-500 transform scale-105"
                    : "hover:shadow-xl hover:scale-102"
                }
              `}
            >
              {/* Selected Indicator */}
              {selectedPosition === position.code && (
                <div className="absolute top-4 right-4">
                  <div className="bg-blue-500 text-white rounded-full p-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              )}

              {/* Icon */}
              <div
                className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-linear-to-r ${position.color} text-white mb-4`}
              >
                {position.icon}
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-gray-900 mb-2">{position.title}</h3>

              {/* Description */}
              <p className="text-gray-600 text-sm mb-4 line-clamp-3">{position.description}</p>

              {/* Skills */}
              <div className="space-y-2">
                <div className="flex items-center text-xs font-semibold text-gray-700">
                  <Info className="w-3 h-3 mr-1" />
                  Key Skills:
                </div>
                <div className="flex flex-wrap gap-1">
                  {position.skills.slice(0, 3).map((skill, index) => (
                    <span key={index} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                      {skill}
                    </span>
                  ))}
                  {position.skills.length > 3 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                      +{position.skills.length - 3} more
                    </span>
                  )}
                </div>
              </div>

              {/* Hover Tooltip */}
              {hoveredPosition === position.code && (
                <div className="absolute inset-0 bg-white bg-opacity-95 rounded-xl p-6 flex flex-col justify-center">
                  <h4 className="font-bold text-gray-900 mb-2">All Required Skills:</h4>
                  <ul className="space-y-1">
                    {position.skills.map((skill, index) => (
                      <li key={index} className="text-sm text-gray-700 flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        {skill}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Continue Button */}
        <div className="text-center">
          <button
            onClick={handleSubmit}
            disabled={!selectedPosition || isSubmitting}
            className={`
              inline-flex items-center px-8 py-4 rounded-lg font-semibold text-lg transition-all
              ${
                selectedPosition && !isSubmitting
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }
            `}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Creating Interview...
              </>
            ) : (
              <>
                Continue to Interview
                <ArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </button>

          {selectedPosition && (
            <p className="mt-4 text-sm text-gray-600">
              You selected:{" "}
              <span className="font-semibold">{positions.find((p) => p.code === selectedPosition)?.title}</span>
            </p>
          )}
        </div>

        {/* Back Button */}
        <div className="text-center mt-6">
          <button
            onClick={() => router.push("/register")}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            disabled={isSubmitting}
          >
            ← Back to Registration
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PositionSelectPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <PositionSelectPageInner />
    </Suspense>
  );
}

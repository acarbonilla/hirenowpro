"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { applicantAPI, interviewAPI, api, publicAPI } from "@/lib/api";
import { useStore } from "@/store/useStore";
import { UserPlus, Mail, Phone, User, Loader2, MapPin } from "lucide-react";
import { getCurrentLocation, GeolocationData } from "@/lib/geolocation";

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCurrentApplicant, setCurrentInterview } = useStore();
  const resumeStorageKey = "resumeInterview";
  const [positionCode, setPositionCode] = useState<string | null>(null);
  const [positionTypeId, setPositionTypeId] = useState<number | null>(null);
  const [jobPositionName, setJobPositionName] = useState<string | null>(null);
  const [officeId, setOfficeId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingApplicationDetected, setPendingApplicationDetected] = useState(false);
  const [resumeInterviewId, setResumeInterviewId] = useState<number | null>(null);
  const [resumeDetected, setResumeDetected] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [apiError, setApiError] = useState("");
  const [location, setLocation] = useState<GeolocationData | null>(null);
  const [locationSource, setLocationSource] = useState<"gps" | "ip" | "none">("none");
  const [locationError, setLocationError] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(true);

  // Resolve job position to position type on mount
  useEffect(() => {
    const jobPosition = searchParams.get("position");
    const officeParam = searchParams.get("office");

    if (!jobPosition) {
      setApiError("Position is required. Please start from the positions page.");
      setPositionCode(null);
      setPositionTypeId(null);
      setOfficeId(null);
      return;
    }

    setPositionCode(jobPosition);
    setOfficeId(officeParam ? Number(officeParam) : null);

    const resolvePosition = async () => {
      try {
        const response = await publicAPI.get("/positions/", { params: { code: jobPosition } });
        const data = response.data?.results?.[0] || response.data?.[0] || response.data;
        if (data) {
          const positionType = data.position_type?.id || data.id;
          if (!positionType) {
            setApiError("Position is invalid. Please start from the positions page.");
            return;
          }
          setPositionTypeId(positionType);
          setJobPositionName(data.name);
        }
      } catch (error) {
        console.error("Failed to resolve job position:", error);
        setApiError("Position lookup failed. Please start from the positions page.");
      }
    };
    resolvePosition();
  }, [searchParams]);

  const writeResumeIntent = (interviewId: number, position: string | null) => {
    if (typeof window === "undefined") return;
    const payload = { interviewId, position, createdAt: Date.now() };
    sessionStorage.setItem(resumeStorageKey, JSON.stringify(payload));
  };

  const clearResumeIntent = () => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(resumeStorageKey);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !positionCode) return;
    const raw = sessionStorage.getItem(resumeStorageKey);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { interviewId?: number; position?: string };
      if (payload?.interviewId && payload.position === positionCode) {
        setResumeInterviewId(payload.interviewId);
        setResumeDetected(true);
      }
    } catch {
      sessionStorage.removeItem(resumeStorageKey);
    }
  }, [positionCode]);

  // Get geolocation on component mount
  useEffect(() => {
    const getLocation = async () => {
      try {
        const coords = await getCurrentLocation(20000, false);
        setLocation(coords);
        setLocationSource("gps");
        setLocationError("");
      } catch (error: any) {
        console.warn("Geolocation error:", error.message);
        // Fallback to IP-based geolocation
        try {
          const res = await fetch("https://ipapi.co/json/");
          const data = await res.json();
          if (data && data.latitude && data.longitude) {
            const fallback = {
              latitude: data.latitude,
              longitude: data.longitude,
              accuracy: data?.accuracy || 0,
            };
            setLocation(fallback);
            setLocationSource("ip");
            setLocationError("");
          } else {
            setLocation(null);
            setLocationSource("none");
            setLocationError("Location not available");
          }
        } catch (ipErr) {
          console.warn("IP geolocation failed", ipErr);
          setLocation(null);
          setLocationSource("none");
          setLocationError("Location not available");
        }
      } finally {
        setIsGettingLocation(false);
      }
    };

    getLocation();
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // First name validation
    if (!formData.first_name.trim()) {
      newErrors.first_name = "First name is required";
    } else if (formData.first_name.trim().length < 2) {
      newErrors.first_name = "First name must be at least 2 characters";
    }

    // Last name validation
    if (!formData.last_name.trim()) {
      newErrors.last_name = "Last name is required";
    } else if (formData.last_name.trim().length < 2) {
      newErrors.last_name = "Last name must be at least 2 characters";
    }

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }

    // Phone validation
    if (!formData.phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (!/^\+?[\d\s\-()]{10,}$/.test(formData.phone)) {
      newErrors.phone = "Invalid phone number format";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
    setApiError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!positionCode || !positionTypeId) {
      setApiError("Position is required. Please start from the positions page.");
      return;
    }

    setIsSubmitting(true);
    setApiError("");

    try {
      // Prepare data with location if available
      const registrationData = {
        ...formData,
        applicant_lat: location?.latitude ?? null,
        applicant_lng: location?.longitude ?? null,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        is_onsite: locationSource === "gps",
        location_source: locationSource,
        position_type_id: positionTypeId,
        office_id: officeId,
        };

      console.log("Sending registration data:", registrationData);

      // Register applicant
      const applicantResponse = await applicantAPI.register(registrationData);
      const applicant = applicantResponse.data.applicant || applicantResponse.data;
      const token = applicantResponse.data.token;
      const resumeInterviewId = applicantResponse.data.interview_id;
      const shouldResume = applicantResponse.data.resume === true && resumeInterviewId;

      if (token) {
        localStorage.setItem("applicantToken", token);
      }

      setCurrentApplicant(applicant);

      if (shouldResume) {
        setResumeInterviewId(resumeInterviewId);
        setResumeDetected(true);
        setShowResumeModal(true);
        writeResumeIntent(resumeInterviewId, positionCode);
        setIsSubmitting(false);
        return;
      }

      // Create interview and redirect directly
      try {
        if (!positionCode || !positionTypeId) {
          setApiError("Unable to resolve position. Please start from the positions page.");
          return;
        }

        const finalPayload = {
          applicant_id: applicant.id,
          position_code: positionCode,
          interview_type: "initial_ai",
        };
        console.log("DEBUG finalPayload:", finalPayload);

        const interviewResponse = await interviewAPI.createInterview(finalPayload);

        console.log("DEBUG interviewResponse:", interviewResponse);

        const interviewPayload = interviewResponse.data?.interview || interviewResponse.data;
        const interviewId = interviewPayload?.id || interviewResponse.data?.id;
        if (interviewResponse.data?.resume === true && interviewId) {
          setResumeInterviewId(interviewId);
          setResumeDetected(true);
          setShowResumeModal(true);
          writeResumeIntent(interviewId, positionCode);
          setIsSubmitting(false);
          return;
        }
        if (!interviewId) {
          throw new Error("Interview ID missing from response");
        }
        if (![200, 201].includes(interviewResponse.status) || !interviewId) {
          console.error("Invalid interview creation response:", interviewResponse);
          setApiError("Unable to start interview. Please try again.");
          return;
        }

        console.log("Redirecting to interview:", interviewId);
        clearResumeIntent();
        router.push(`/interview/${interviewId}`);
        return;
      } catch (error: any) {
        console.error("Failed to create interview:", error);
        console.error("Error response:", error.response?.data);
        console.error("Error status:", error.response?.status);
        if (error.response?.status === 409 && error.response?.data?.state === "already_submitted") {
          setApiError("This interview has already been completed and submitted.");
          return;
        }
        if (error.response?.status === 409 && error.response?.data?.state === "archived") {
          setApiError("This interview was archived. Please contact HR to request a retake.");
          return;
        }
        setApiError("Unable to start interview. Please try again.");
        return;
      }
    } catch (error: any) {
      if (error.response?.data) {
        const errorData = error.response.data;
        const state = errorData.state || "";
        if (state === "already_submitted") {
          setApiError("You already submitted this interview. Please wait for HR review.");
          setIsSubmitting(false);
          return;
        }
        if (state === "archived") {
          setApiError("This interview was archived. Please contact HR to request a retake.");
          setIsSubmitting(false);
          return;
        }
        if (state === "applicant_exists") {
          setApiError("An application already exists for this email. Please try again with your existing interview.");
          setIsSubmitting(false);
          return;
        }
        const emailMessage = errorData?.details?.email?.[0] || "";

        if (emailMessage.includes("currently being processed")) {
          setPendingApplicationDetected(true);
          setApiError("You already have an ongoing application. Please wait for the result.");
          setIsSubmitting(false);

          setTimeout(() => {
            router.push("/application/status");
          }, 2000);

          return;
        }

        if (emailMessage.includes("You can reapply after")) {
          setApiError(emailMessage);
          setIsSubmitting(false);
          return;
        }

        if (emailMessage.includes("already hired")) {
          setApiError("You are already hired. Please contact HR if you have any questions.");
          setIsSubmitting(false);
          return;
        }

        // Handle field-specific errors from backend
        if (typeof errorData === "object" && !errorData.message && !errorData.error) {
          const fieldErrors: Record<string, string> = {};
          Object.keys(errorData).forEach((key) => {
            if (key !== "detail") {
              // Skip generic detail field
              const errorMsg = Array.isArray(errorData[key]) ? errorData[key][0] : errorData[key];
              fieldErrors[key] = errorMsg;
            }
          });

          // If we have field errors, set them
          if (Object.keys(fieldErrors).length > 0) {
            setErrors(fieldErrors);
            setApiError("Please fix the errors below and try again.");
          } else {
            // No field errors, show the detail or generic message
            setApiError(errorData.detail || JSON.stringify(errorData) || "Registration failed. Please try again.");
          }
          return;
        }

        const message = errorData.message || errorData.error || errorData.detail || "";

        if (message.includes("currently being processed")) {
          setPendingApplicationDetected(true);
          setApiError("You already have an ongoing application. Redirecting you to continue...");
          setTimeout(() => {
            router.push("/resume-application");
          }, 1500);
          return;
        }

        setApiError(
          message || "We couldn't submit your application due to a system issue. Please try again later."
        );
        setIsSubmitting(false);
        return;
      } else {
        setApiError("Unable to connect to server. Please check your connection and try again.");
        setIsSubmitting(false);
        return;
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <UserPlus className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Create Your Account</h1>
          <p className="text-gray-600">Fill in your details to start your video interview</p>
        </div>

        {/* Location Status */}
        {isGettingLocation && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin mr-3" />
              <p className="text-blue-800 text-sm">Detecting your location...</p>
            </div>
          </div>
        )}

        {location && !isGettingLocation && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <MapPin className="w-5 h-5 text-green-600 mr-3" />
              <p className="text-green-800 text-sm">Location detected successfully</p>
            </div>
          </div>
        )}

        {locationError && !isGettingLocation && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start">
              <MapPin className="w-5 h-5 text-yellow-600 mr-3 mt-0.5" />
              <div>
                <p className="text-yellow-800 text-sm font-medium">Location not available</p>
                <p className="text-yellow-700 text-xs mt-1">{locationError}</p>
                <p className="text-yellow-700 text-xs mt-1">
                  You can still register, but your application will be marked as online.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* API Error Alert */}
        {apiError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <div className="shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-red-800 text-sm font-medium">{apiError}</p>
              </div>
            </div>
          </div>
        )}

        {resumeDetected && resumeInterviewId && showResumeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full text-center">
              <h2 className="text-xl font-bold mb-2">Resume Interview</h2>
              <p className="text-gray-700 mb-4">
                You have an interview in progress for this position.
              </p>
              <button
                type="button"
                onClick={() => {
                  clearResumeIntent();
                  router.push(`/interview/${resumeInterviewId}`);
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Continue Interview
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResumeModal(false);
                  setResumeDetected(false);
                  setResumeInterviewId(null);
                  router.push("/positions");
                }}
                className="mt-3 w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
              >
                Not Now
              </button>
            </div>
          </div>
        )}

        {resumeDetected && resumeInterviewId && !showResumeModal && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start">
              <div className="shrink-0">
                <svg className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-9-1a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1zm1 4a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-blue-900 text-sm font-medium">
                  You have an interview in progress for this position.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    clearResumeIntent();
                    router.push(`/interview/${resumeInterviewId}`);
                  }}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  Continue Interview
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="bg-white shadow-lg rounded-lg p-8 space-y-6">
          {resumeDetected && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <span className="text-sm font-semibold text-blue-900">Interview in progress</span>
              <span className="text-xs text-blue-700">
                You already have an interview in progress for this position.
              </span>
            </div>
          )}
          {/* First Name */}
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-2">
              <User className="w-4 h-4 inline mr-2" />
              First Name
            </label>
            <input
              type="text"
              id="first_name"
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${errors.first_name ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="John"
              disabled={isSubmitting}
            />
            {errors.first_name && <p className="mt-1 text-sm text-red-600">{errors.first_name}</p>}
          </div>

          {/* Last Name */}
          <div>
            <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-2">
              <User className="w-4 h-4 inline mr-2" />
              Last Name
            </label>
            <input
              type="text"
              id="last_name"
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${errors.last_name ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="Doe"
              disabled={isSubmitting}
            />
            {errors.last_name && <p className="mt-1 text-sm text-red-600">{errors.last_name}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              <Mail className="w-4 h-4 inline mr-2" />
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${errors.email ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="john.doe@example.com"
              disabled={isSubmitting}
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
            {!errors.email && (
              <p className="mt-1 text-xs text-gray-500">
                Make sure this email is unique. Each applicant needs a different email address.
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              <Phone className="w-4 h-4 inline mr-2" />
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${errors.phone ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="+1 234 567 8900"
              disabled={isSubmitting}
            />
            {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
            {!errors.phone && (
              <p className="mt-1 text-xs text-gray-500">
                Include country code and at least 10 digits (e.g., +1234567890)
              </p>
            )}
          </div>

          {/* Position Display */}
          {jobPositionName && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Position
              </label>
              <input
                type="text"
                value={jobPositionName}
                readOnly
                className="w-full px-4 py-2 border rounded-lg bg-gray-50 border-gray-300 text-gray-700"
              />
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || pendingApplicationDetected || resumeDetected}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Creating Account...
              </>
            ) : (
              "Start Interview"
            )}
          </button>
        </form>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <button
            onClick={() => router.push("/")}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            disabled={isSubmitting}
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageContent />
    </Suspense>
  );
}





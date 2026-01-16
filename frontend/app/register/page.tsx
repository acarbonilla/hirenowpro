"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { applicantAPI, interviewAPI, publicAPI } from "@/lib/api";
import { useStore } from "@/store/useStore";
import { Loader2, Mail, MapPin, Phone, User, UserPlus } from "lucide-react";
import { getCurrentLocation, GeolocationData } from "@/lib/geolocation";
import { motion, useReducedMotion } from "framer-motion";

const PROGRESS_STEPS = [
  { label: "Position", state: "complete" },
  { label: "Register", state: "current" },
  { label: "Interview", state: "upcoming" },
] as const;

const logDebug = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
};

function ProgressIndicator() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
      {PROGRESS_STEPS.map((step, index) => {
        const isComplete = step.state === "complete";
        const isCurrent = step.state === "current";
        return (
          <div key={step.label} className="flex items-center gap-3">
            <div
              className={`flex h-7 items-center gap-2 rounded-full px-3 ${
                isComplete
                  ? "bg-teal-300 text-slate-950"
                  : isCurrent
                  ? "border border-teal-300 text-teal-200"
                  : "border border-white/20 text-slate-400"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              <span>{step.label}</span>
            </div>
            {index < PROGRESS_STEPS.length - 1 && <span className="h-px w-6 bg-white/20" />}
          </div>
        );
      })}
    </div>
  );
}

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCurrentApplicant, setCurrentInterview } = useStore();
  const shouldReduceMotion = useReducedMotion();
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
  const submitLock = useRef(false);
  const inFlightRequest = useRef<Promise<unknown> | null>(null);
  const submitAttempts = useRef(0);
  const [pendingApplicationDetected, setPendingApplicationDetected] = useState(false);
  const [resumeInterviewId, setResumeInterviewId] = useState<number | null>(null);
  const [resumeDetected, setResumeDetected] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [apiError, setApiError] = useState("");
  const [location, setLocation] = useState<GeolocationData | null>(null);
  const [locationSource, setLocationSource] = useState<"gps" | "ip" | "none">("none");
  const [locationError, setLocationError] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(true);

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

  useEffect(() => {
    const getLocation = async () => {
      try {
        const coords = await getCurrentLocation(20000, false);
        setLocation(coords);
        setLocationSource("gps");
        setLocationError("");
      } catch (error: any) {
        console.warn("Geolocation error:", error.message);
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

    if (!formData.first_name.trim()) {
      newErrors.first_name = "First name is required";
    } else if (formData.first_name.trim().length < 2) {
      newErrors.first_name = "First name must be at least 2 characters";
    }

    if (!formData.last_name.trim()) {
      newErrors.last_name = "Last name is required";
    } else if (formData.last_name.trim().length < 2) {
      newErrors.last_name = "Last name must be at least 2 characters";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }

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

    if (submitLock.current || isSubmitting || inFlightRequest.current) {
      logDebug("Duplicate submit prevented", { attempts: submitAttempts.current });
      return;
    }

    submitLock.current = true;
    setIsSubmitting(true);
    setApiError("");

    try {
      submitAttempts.current += 1;
      logDebug("Registration submit attempt", { attempt: submitAttempts.current });
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
      const normalizeCoordinate = (value: number) => Number(value.toFixed(6));
      if (typeof registrationData.latitude === "number") {
        registrationData.latitude = normalizeCoordinate(registrationData.latitude);
      }
      if (typeof registrationData.longitude === "number") {
        registrationData.longitude = normalizeCoordinate(registrationData.longitude);
      }
      if (typeof registrationData.applicant_lat === "number") {
        registrationData.applicant_lat = normalizeCoordinate(registrationData.applicant_lat);
      }
      if (typeof registrationData.applicant_lng === "number") {
        registrationData.applicant_lng = normalizeCoordinate(registrationData.applicant_lng);
      }

      logDebug("Sending registration data:", registrationData);

      const requestPromise = applicantAPI.register(registrationData);
      inFlightRequest.current = requestPromise;
      const applicantResponse = await requestPromise;
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
        logDebug("DEBUG finalPayload:", finalPayload);

        const interviewResponse = await interviewAPI.createInterview(finalPayload);

        logDebug("DEBUG interviewResponse:", interviewResponse);

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

        logDebug("Redirecting to interview:", interviewId);
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
      if (error.response?.status === 429) {
        setApiError("Too many attempts. Please wait a minute and try again.");
        setIsSubmitting(false);
        return;
      }
      if (error.response?.status === 409 && error.response?.data?.state === "duplicate_request") {
        setApiError("Your registration is already being processed. Please wait a moment.");
        setIsSubmitting(false);
        return;
      }
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
        if (errorData.details && typeof errorData.details === "object") {
          const fieldErrors: Record<string, string> = {};
          Object.keys(errorData.details).forEach((key) => {
            const errorValue = errorData.details[key];
            fieldErrors[key] = Array.isArray(errorValue) ? errorValue[0] : String(errorValue);
          });
          if (Object.keys(fieldErrors).length > 0) {
            setErrors(fieldErrors);
            setApiError("Please fix the errors below and try again.");
            setIsSubmitting(false);
            return;
          }
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

        if (typeof errorData === "object" && !errorData.message && !errorData.error) {
          const fieldErrors: Record<string, string> = {};
          Object.keys(errorData).forEach((key) => {
            if (key !== "detail") {
              const errorMsg = Array.isArray(errorData[key]) ? errorData[key][0] : errorData[key];
              fieldErrors[key] = errorMsg;
            }
          });

          if (Object.keys(fieldErrors).length > 0) {
            setErrors(fieldErrors);
            setApiError("Please fix the errors below and try again.");
          } else {
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

        setApiError(message || "We couldn't submit your application due to a system issue. Please try again later.");
        setIsSubmitting(false);
        return;
      }
      setApiError("Unable to connect to server. Please check your connection and try again.");
      setIsSubmitting(false);
      return;
    } finally {
      setIsSubmitting(false);
      submitLock.current = false;
      inFlightRequest.current = null;
    }
  };

  const containerMotion = useMemo(
    () => ({
      initial: shouldReduceMotion ? false : { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.3 },
    }),
    [shouldReduceMotion]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="relative overflow-hidden">
        <div className="absolute -top-28 right-[-10%] h-80 w-80 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-[-10%] h-80 w-80 rounded-full bg-sky-500/15 blur-3xl" />

        <motion.div {...containerMotion} className="relative mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <header className="space-y-6">
            <ProgressIndicator />
            <div className="space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                <UserPlus className="h-6 w-6 text-teal-200" />
              </div>
              <h1 className="text-3xl font-semibold sm:text-4xl">Applicant Registration</h1>
              <p className="text-base text-slate-300">
                Provide basic information to begin the initial interview.
              </p>
            </div>
          </header>

          {isGettingLocation && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-teal-200" />
                <p>Detecting your location...</p>
              </div>
            </div>
          )}

          {location && !isGettingLocation && (
            <div className="mt-8 rounded-2xl border border-teal-300/30 bg-teal-400/10 p-4 text-sm text-teal-100">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-teal-200" />
                <p>Location detected successfully</p>
              </div>
            </div>
          )}

          {locationError && !isGettingLocation && (
            <div className="mt-8 rounded-2xl border border-amber-300/40 bg-amber-400/10 p-4 text-sm text-amber-100">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-amber-200" />
                <div>
                  <p className="font-semibold text-amber-100">Location not available</p>
                  <p className="mt-1 text-xs text-amber-100/80">{locationError}</p>
                  <p className="mt-1 text-xs text-amber-100/80">
                    You can still register, but your application will be marked as online.
                  </p>
                </div>
              </div>
            </div>
          )}

          {apiError && (
            <div className="mt-8 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              <p className="font-semibold">{apiError}</p>
            </div>
          )}

          {resumeDetected && resumeInterviewId && showResumeModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center text-slate-900 shadow-lg">
                <h2 className="text-xl font-semibold">Resume Interview</h2>
                <p className="mt-2 text-sm text-slate-600">
                  You have an interview in progress for this position.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    clearResumeIntent();
                    router.push(`/interview/${resumeInterviewId}`);
                  }}
                  className="mt-4 w-full rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
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
                  className="mt-3 w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300"
                >
                  Not Now
                </button>
              </div>
            </div>
          )}

          {resumeDetected && resumeInterviewId && !showResumeModal && (
            <div className="mt-8 rounded-2xl border border-teal-300/30 bg-teal-400/10 p-4 text-sm text-teal-100">
              <p className="font-semibold">You have an interview in progress for this position.</p>
              <button
                type="button"
                onClick={() => {
                  clearResumeIntent();
                  router.push(`/interview/${resumeInterviewId}`);
                }}
                className="mt-3 rounded-full bg-teal-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-300"
              >
                Continue Interview
              </button>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="mt-10 rounded-3xl border border-white/10 bg-white p-8 text-slate-900 shadow-xl sm:p-10"
          >
            {resumeDetected && (
              <div className="mb-6 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
                <p className="font-semibold">Interview in progress</p>
                <p className="text-xs text-teal-700">
                  You already have an interview in progress for this position.
                </p>
              </div>
            )}

            <div className="space-y-8">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Personal information
                </h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="first_name" className="block text-sm font-medium text-slate-700 mb-2">
                      <User className="mr-2 inline h-4 w-4 text-slate-400" />
                      First Name
                    </label>
                    <input
                      type="text"
                      id="first_name"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleChange}
                      className={`w-full rounded-xl border px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-300/60 ${
                        errors.first_name ? "border-rose-400" : "border-slate-200"
                      }`}
                      placeholder="John"
                      disabled={isSubmitting}
                    />
                    {errors.first_name && <p className="mt-1 text-xs text-rose-500">{errors.first_name}</p>}
                  </div>

                  <div>
                    <label htmlFor="last_name" className="block text-sm font-medium text-slate-700 mb-2">
                      <User className="mr-2 inline h-4 w-4 text-slate-400" />
                      Last Name
                    </label>
                    <input
                      type="text"
                      id="last_name"
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleChange}
                      className={`w-full rounded-xl border px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-300/60 ${
                        errors.last_name ? "border-rose-400" : "border-slate-200"
                      }`}
                      placeholder="Doe"
                      disabled={isSubmitting}
                    />
                    {errors.last_name && <p className="mt-1 text-xs text-rose-500">{errors.last_name}</p>}
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Contact information
                </h2>
                <div className="mt-4 grid gap-5">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                      <Mail className="mr-2 inline h-4 w-4 text-slate-400" />
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className={`w-full rounded-xl border px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-300/60 ${
                        errors.email ? "border-rose-400" : "border-slate-200"
                      }`}
                      placeholder="john.doe@example.com"
                      disabled={isSubmitting}
                    />
                    {errors.email && <p className="mt-1 text-xs text-rose-500">{errors.email}</p>}
                    {!errors.email && (
                      <p className="mt-1 text-xs text-slate-500">
                        Use a unique email address for each applicant.
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-2">
                      <Phone className="mr-2 inline h-4 w-4 text-slate-400" />
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className={`w-full rounded-xl border px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-300/60 ${
                        errors.phone ? "border-rose-400" : "border-slate-200"
                      }`}
                      placeholder="+1 234 567 8900"
                      disabled={isSubmitting}
                    />
                    {errors.phone && <p className="mt-1 text-xs text-rose-500">{errors.phone}</p>}
                    {!errors.phone && (
                      <p className="mt-1 text-xs text-slate-500">
                        Include country code and at least 10 digits.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {jobPositionName && (
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Position
                  </h2>
                  <input
                    type="text"
                    value={jobPositionName}
                    readOnly
                    className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700"
                  />
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                No resume or documents required at this stage.
              </div>

              <button
                type="submit"
                disabled={isSubmitting || pendingApplicationDetected || resumeDetected}
                className="w-full rounded-full bg-slate-950 py-3 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:bg-slate-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Preparing interview...
                  </span>
                ) : (
                  "Proceed to Interview"
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => router.push("/")}
              className="text-sm font-semibold text-teal-200 hover:text-teal-100"
              disabled={isSubmitting}
            >
              Back to Home
            </button>
          </div>
        </motion.div>
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

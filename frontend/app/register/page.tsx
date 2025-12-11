"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { applicantAPI, interviewAPI, api } from "@/lib/api";
import { useStore } from "@/store/useStore";
import { UserPlus, Mail, Phone, User, Loader2, MapPin } from "lucide-react";
import { getCurrentLocation, GeolocationData } from "@/lib/geolocation";

export default function RegisterPage() {
  const router = useRouter();
  const { setCurrentApplicant, setCurrentInterview } = useStore();
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [location, setLocation] = useState<GeolocationData | null>(null);
  const [locationError, setLocationError] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(true);

  // Check for position parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const position = params.get("position");
    if (position) {
      setSelectedPosition(position);
    }
  }, []);

  // Get geolocation on component mount
  useEffect(() => {
    const getLocation = async () => {
      try {
        const coords = await getCurrentLocation(3000);
        setLocation(coords);
        setLocationError("");
      } catch (error: any) {
        console.warn("Geolocation error:", error.message);
        setLocationError(error.message);
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
      };

      console.log("Sending registration data:", registrationData);

      // Register applicant
      const applicantResponse = await applicantAPI.register(registrationData);
      const applicant = applicantResponse.data.applicant || applicantResponse.data;
      const token = applicantResponse.data.token;
      const redirectUrl = applicantResponse.data.redirect_url;

      if (token) {
        localStorage.setItem("applicantToken", token);
      }

      setCurrentApplicant(applicant);

      // If position is selected, create interview and redirect directly
      if (selectedPosition) {
        try {
          console.log("DEBUG selectedPosition:", selectedPosition);
          console.log("DEBUG applicant:", applicant);

          const posRes = await api.get("/position-types/", { params: { position_code: selectedPosition } });
          const first = posRes.data?.results?.[0] || posRes.data?.[0];
          const positionTypeId = first?.id;
          console.log("DEBUG resolvedPositionType:", positionTypeId);
          if (!positionTypeId) {
            console.error("DEBUG position-types response:", posRes.data);
            throw new Error("Unable to resolve position type ID");
          }

          const interviewResponse = await interviewAPI.createInterview({
            applicant: applicant.id,
            interview_type: "initial_ai",
            position_type: positionTypeId,
          });

          console.log("DEBUG interviewResponse:", interviewResponse?.data);

          const interview = interviewResponse.data.interview || interviewResponse.data;
          console.log("Interview object:", interview);
          console.log("Interview ID:", interview.id);

          if (!interview || !interview.id) {
            throw new Error("Invalid interview data received - no ID");
          }

          setCurrentInterview(interview);
          console.log("Redirecting to interview:", interview.id);
          router.push(`/interview/${interview.id}`);
          return;
        } catch (error: any) {
          console.error("Failed to create interview:", error);
          console.error("Error response:", error.response?.data);
          console.error("Error status:", error.response?.status);
          // Fall back to position select if interview creation fails
        }
      }

      // Redirect using backend-provided redirect URL if available
      if (redirectUrl) {
        router.push(redirectUrl);
      } else {
        router.push(`/position-select?applicant_id=${applicant.id}`);
      }
    } catch (error: any) {
      console.error("Registration error:", error);
      console.error("Error response data:", JSON.stringify(error.response?.data, null, 2));
      console.error("Error status:", error.response?.status);

      if (error.response?.data) {
        const errorData = error.response.data;

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
        } else {
          setApiError(
            errorData.message || errorData.error || errorData.detail || "Registration failed. Please try again."
          );
        }
      } else {
        setApiError("Unable to connect to server. Please check your connection and try again.");
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

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="bg-white shadow-lg rounded-lg p-8 space-y-6">
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
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

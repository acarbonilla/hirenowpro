"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Webcam from "react-webcam";
import { interviewAPI, questionAPI } from "@/lib/api";
import { getApplicantToken } from "@/app/utils/auth-applicant";
import { useStore } from "@/store/useStore";
import {
  Video,
  VideoOff,
  Circle,
  Square,
  ChevronLeft,
  ChevronRight,
  Send,
  Loader2,
  CheckCircle,
  Camera,
  AlertCircle,
  Volume2,
  VolumeX,
  Clock,
} from "lucide-react";
import type { Interview, InterviewQuestion } from "@/types";

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const interviewId = parseInt(params.id as string);

  const webcamRef = useRef<Webcam>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);

  const {
    currentInterview,
    setCurrentInterview,
    questions,
    setQuestions,
    currentQuestionIndex,
    nextQuestion,
    previousQuestion,
    recordedVideos,
    addRecordedVideo,
  } = useStore();

  const [interview, setInterview] = useState<Interview | null>(currentInterview);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionCountdown, setTransitionCountdown] = useState(0);
  const [showInitialCountdown, setShowInitialCountdown] = useState(true);
  const [initialCountdown, setInitialCountdown] = useState(5);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Load interview and questions
  useEffect(() => {
    const loadInterviewData = async () => {
      try {
        setIsLoading(true);

        // Fetch interview details
        const token = getApplicantToken();
        console.log("DEBUG interviewId param:", interviewId);
        console.log("DEBUG applicantToken:", token);
        if (!token) {
          router.push("/interview-login?missing=true");
          return;
        }
        const interviewResponse = await interviewAPI.getInterview(interviewId, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        console.log("Interview Response:", interviewResponse.data);
        const interviewData = interviewResponse.data.interview || interviewResponse.data;
        console.log("Interview Data:", interviewData);

        if (!interviewData || !interviewData.id) {
          throw new Error("Invalid interview data received");
        }

        setInterview(interviewData);
        setCurrentInterview(interviewData);

        // Fetch questions (filter by position if available in interview data)
        // interviewData.position_type is the code (e.g. "virtual_assistant")
        const questionsResponse = interviewData.position_type
          ? await questionAPI.getQuestions({ position: interviewData.position_type })
          : await questionAPI.getQuestions();

        console.log("Questions Response:", questionsResponse.data);
        let questionsData = questionsResponse.data.questions || questionsResponse.data;

        // Handle paginated response
        if (questionsData.results && Array.isArray(questionsData.results)) {
          questionsData = questionsData.results;
        }

        // Ensure it's an array
        if (!Array.isArray(questionsData)) {
          console.error("Questions data is not an array:", questionsData);
          throw new Error("Invalid questions data format");
        }

        // Randomize questions order and limit to 5 questions
        const shuffledQuestions = [...questionsData].sort(() => Math.random() - 0.5).slice(0, 5); // Limit to 5 random questions

        console.log(
          `Questions loaded: ${questionsData.length} available, randomly selected ${shuffledQuestions.length}`
        );
        setQuestions(shuffledQuestions);

        setIsLoading(false);

        // Start initial countdown
        startInitialCountdown();
      } catch (err: any) {
        console.error("Error loading interview:", err);
        setError(err.response?.data?.message || err.message || "Failed to load interview. Please try again.");
        setIsLoading(false);
      }
    };

    loadInterviewData();
  }, [interviewId, setCurrentInterview, setQuestions]);

  // Initial countdown before first question
  const startInitialCountdown = () => {
    let countdown = 5;
    setInitialCountdown(countdown);
    setShowInitialCountdown(true);

    const countdownInterval = setInterval(() => {
      countdown--;
      setInitialCountdown(countdown);

      if (countdown <= 0) {
        clearInterval(countdownInterval);
        setShowInitialCountdown(false);
        // Speak the first question after countdown
        const firstQuestion = questions[0];
        if (firstQuestion) {
          speakQuestion(firstQuestion.question_text, firstQuestion.id);
        }
      }
    }, 1000);
  };

  // Text-to-speech function
  const speakQuestion = (text: string, questionId?: number) => {
    if (!text) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Auto-start recording after voice finishes (1 second delay)
      setTimeout(() => {
        // Get the question ID to check - use parameter if provided, otherwise current question
        const qId = questionId || questions[currentQuestionIndex]?.id;
        const alreadyRecorded = qId && recordedVideos[qId];

        console.log("Auto-record check:", {
          questionId: qId,
          alreadyRecorded,
          cameraReady,
          isRecording,
          currentQuestionIndex,
        });

        if (cameraReady && !isRecording && !alreadyRecorded) {
          console.log("Auto-starting recording for question", qId);
          startRecording();
        } else {
          console.log("Skipping auto-record:", { cameraReady, isRecording, alreadyRecorded });
        }
      }, 1000);
    };
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // Speak question when it changes
  useEffect(() => {
    if (!showInitialCountdown && !isTransitioning && questions[currentQuestionIndex]) {
      // Small delay before speaking to let UI settle
      const timer = setTimeout(() => {
        const currentQuestion = questions[currentQuestionIndex];
        speakQuestion(currentQuestion.question_text, currentQuestion.id);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentQuestionIndex, showInitialCountdown, isTransitioning, questions]);

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
    // Don't reset recording time when stopping - we need it for upload
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleDataAvailable = useCallback(({ data }: BlobEvent) => {
    if (data.size > 0) {
      setRecordedChunks((prev) => [...prev, data]);
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!webcamRef.current?.stream) {
      setError("Camera not ready. Please allow camera access.");
      return;
    }

    // Verify audio tracks are present
    const audioTracks = webcamRef.current.stream.getAudioTracks();
    const videoTracks = webcamRef.current.stream.getVideoTracks();

    console.log("Starting recording - Audio tracks:", audioTracks.length);
    console.log("Starting recording - Video tracks:", videoTracks.length);

    if (audioTracks.length === 0) {
      setError("No microphone detected. Please enable microphone access and refresh the page.");
      return;
    }

    if (videoTracks.length === 0) {
      setError("No camera detected. Please enable camera access and refresh the page.");
      return;
    }

    // Log audio track details
    audioTracks.forEach((track, index) => {
      console.log(`Audio track ${index}:`, {
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: track.getSettings(),
      });
    });

    setRecordedChunks([]);
    setError("");
    setSuccessMessage("");

    // Configure MediaRecorder with audio codec
    let options = { mimeType: "video/webm;codecs=vp9,opus" };

    // Fallback if vp9/opus not supported
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      console.log("vp9,opus not supported, trying vp8,opus");
      options = { mimeType: "video/webm;codecs=vp8,opus" };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log("vp8,opus not supported, using default video/webm");
        options = { mimeType: "video/webm" };
      }
    }

    console.log("Using MIME type:", options.mimeType);

    const mediaRecorder = new MediaRecorder(webcamRef.current.stream, options);

    mediaRecorder.ondataavailable = handleDataAvailable;
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);

    console.log("MediaRecorder started with state:", mediaRecorder.state);
  }, [handleDataAvailable]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Auto-upload when recording stops and chunks are ready
  useEffect(() => {
    if (!isRecording && recordedChunks.length > 0 && !isUploading) {
      const timer = setTimeout(() => {
        handleUploadVideo();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isRecording, recordedChunks.length]);

  const handleUploadVideo = async () => {
    if (recordedChunks.length === 0) {
      setError("No video recorded. Please record your response first.");
      return;
    }

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) {
      setError("No question selected.");
      return;
    }

    setIsUploading(true);
    setError("");

    try {
      // Create blob from recorded chunks
      const blob = new Blob(recordedChunks, { type: "video/webm" });

      // Create form data
      const formData = new FormData();
      formData.append("video_file_path", blob, `question_${currentQuestion.id}_${Date.now()}.webm`);
      formData.append("question_id", currentQuestion.id.toString());
      // Ensure at least 1 second duration (0 might cause validation error)
      const actualDuration = Math.max(recordingTime, 1);
      formData.append("duration", formatDuration(actualDuration));

      console.log("Uploading video response:");
      console.log("- Interview ID:", interviewId);
      console.log("- Current Question:", currentQuestion);
      console.log("- Question ID:", currentQuestion.id);
      console.log("- Recording Time (seconds):", recordingTime);
      console.log("- Duration (formatted):", formatDuration(recordingTime));
      console.log("- Blob size:", blob.size, "bytes");
      console.log("- FormData entries:");
      for (let pair of formData.entries()) {
        console.log("  ", pair[0], ":", typeof pair[1] === "object" ? `File (${pair[1].size} bytes)` : pair[1]);
      }

      // Upload video (this includes AI processing on backend, takes 30-60 seconds)
      await interviewAPI.uploadVideoResponse(interviewId, formData);

      console.log("Video uploaded successfully!");

      // Store video blob in state
      addRecordedVideo(currentQuestion.id, blob);

      const isLastQuestion = currentQuestionIndex >= questions.length - 1;
      // Calculate total answered AFTER adding to state - use the new count
      const newRecordedVideos = { ...recordedVideos, [currentQuestion.id]: blob };
      const totalAnswered = Object.keys(newRecordedVideos).length;

      console.log(
        `✓ Question ${currentQuestionIndex + 1} recorded. Total answered: ${totalAnswered} of ${questions.length}`
      );

      if (isLastQuestion) {
        setSuccessMessage("✓ Perfect! All questions answered. Ready to submit your interview!");
      } else {
        setSuccessMessage("✓ Great job! Your response has been analyzed.");
      }

      setRecordedChunks([]);
      setRecordingTime(0); // Reset recording time for next question

      // Automatically advance to next question with countdown OR auto-submit if last
      if (!isLastQuestion) {
        setIsTransitioning(true);
        let countdown = 3; // 3 second countdown
        setTransitionCountdown(countdown);

        const countdownInterval = setInterval(() => {
          countdown--;
          setTransitionCountdown(countdown);

          if (countdown <= 0) {
            clearInterval(countdownInterval);
            setIsTransitioning(false);
            setSuccessMessage("");
            nextQuestion();
          }
        }, 1000);
      } else {
        // Last question - auto-submit after 3 seconds
        console.log("Last question answered! Total answered:", totalAnswered, "of", questions.length);
        setTimeout(() => {
          console.log("Auto-submitting interview... (all questions completed)");
          handleSubmitInterview(true); // Pass true to skip validation
        }, 3000);
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      console.error("Error response data:", err.response?.data);
      console.error("Error status:", err.response?.status);
      console.error("Error message:", err.message);

      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.response?.data?.detail ||
        err.message ||
        "Failed to upload video. Please try again.";

      setError(`Upload failed: ${errorMessage}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitInterview = async (skipValidation = false) => {
    // Check if all questions are answered (unless skipping validation for auto-submit)
    const answeredCount = Object.keys(recordedVideos).length;
    console.log(
      "handleSubmitInterview called - answered:",
      answeredCount,
      "total:",
      questions.length,
      "skipValidation:",
      skipValidation
    );

    if (!skipValidation && answeredCount < questions.length) {
      console.warn(`Not all questions answered yet. Answered: ${answeredCount}, Total: ${questions.length}`);
      setError(`Please answer all ${questions.length} questions before submitting.`);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      console.log("Submitting interview:", interviewId);
      console.log("Questions answered:", answeredCount, "of", questions.length);

      await interviewAPI.submitInterview(interviewId);

      console.log("Interview submitted successfully! Redirecting to completion page...");
      // Redirect to a friendly completion screen; user can then choose
      // to view processing status or return to dashboard.
      router.push(`/interview-complete?id=${interviewId}`);
    } catch (err: any) {
      console.error("Submit error:", err);
      console.error("Error response:", err.response?.data);
      console.error("Error status:", err.response?.status);
      console.error("Full error object:", JSON.stringify(err.response?.data, null, 2));

      // Extract detailed error message
      let errorMessage = "Failed to submit interview. Please try again.";

      if (err.response?.data) {
        const data = err.response.data;
        errorMessage =
          data.error || data.message || data.detail || (typeof data === "string" ? data : JSON.stringify(data));
      }

      setError(errorMessage);
      setIsSubmitting(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `00:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading interview...</p>
        </div>
      </div>
    );
  }

  if (!interview || !Array.isArray(questions) || questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Interview Not Found</h1>
          <p className="text-gray-600 mb-6">{error || "The interview could not be loaded. Please try again."}</p>
          <button
            onClick={() => router.push("/")}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const isQuestionAnswered = currentQuestion ? !!recordedVideos[currentQuestion.id] : false;
  const allQuestionsAnswered = Object.keys(recordedVideos).length === questions.length;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 relative">
      {/* Initial Countdown Overlay - Before First Question */}
      {showInitialCountdown && (
        <div className="fixed inset-0 bg-linear-to-br from-purple-600 to-blue-600 z-50 flex items-center justify-center">
          <div className="text-center text-white px-4">
            {/* Main Countdown Circle */}
            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 bg-white bg-opacity-20 rounded-full animate-ping"></div>
              </div>
              <div className="relative flex items-center justify-center">
                <div className="w-40 h-40 bg-white bg-opacity-30 rounded-full flex items-center justify-center backdrop-blur-sm border-4 border-white">
                  <span className="text-8xl font-bold">{initialCountdown}</span>
                </div>
              </div>
            </div>

            <h1 className="text-5xl font-bold mb-4">Get Ready! 🎯</h1>
            <p className="text-2xl mb-2">Your interview is about to begin</p>
            <p className="text-xl opacity-90">Position yourself, relax, and prepare to shine!</p>

            <div className="mt-8 space-y-3">
              <div className="flex items-center justify-center text-lg">
                <CheckCircle className="w-6 h-6 mr-2" />
                <span>{questions.length} questions in total</span>
              </div>
              <div className="flex items-center justify-center text-lg">
                <Volume2 className="w-6 h-6 mr-2" />
                <span>Questions will be read aloud</span>
              </div>
              <div className="flex items-center justify-center text-lg">
                <Camera className="w-6 h-6 mr-2" />
                <span>Record your answers with confidence</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processing Overlay */}
      {isUploading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md mx-4">
            <div className="text-center">
              {/* Animated Icon */}
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 bg-blue-100 rounded-full animate-ping opacity-20"></div>
                </div>
                <div className="relative flex items-center justify-center">
                  <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
                </div>
              </div>

              <h2 className="text-2xl font-bold mb-3 text-gray-800">Processing Your Response</h2>

              <div className="space-y-3 mb-6 text-left">
                <div className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mr-3 animate-pulse"></div>
                  <span>Uploading video...</span>
                </div>
                <div className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mr-3 animate-pulse delay-100"></div>
                  <span>AI analyzing your response...</span>
                </div>
                <div className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mr-3 animate-pulse delay-200"></div>
                  <span>Evaluating communication skills...</span>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 Take a moment to relax!</strong>
                  <br />
                  Your response is being analyzed by AI. This takes about 30-60 seconds.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transition Overlay */}
      {isTransitioning && (
        <div className="fixed inset-0 bg-linear-to-br from-green-500 to-blue-500 bg-opacity-95 z-50 flex items-center justify-center">
          <div className="text-center text-white px-4">
            {/* Countdown Circle */}
            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-40 h-40 bg-white bg-opacity-20 rounded-full animate-ping"></div>
              </div>
              <div className="relative flex items-center justify-center">
                <div className="w-32 h-32 bg-white bg-opacity-30 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <span className="text-7xl font-bold">{transitionCountdown}</span>
                </div>
              </div>
            </div>

            <h2 className="text-4xl font-bold mb-4">Great Job! 🎉</h2>
            <p className="text-xl mb-2">Moving to the next question...</p>
            <p className="text-lg opacity-90">Take a deep breath and prepare yourself</p>
          </div>
        </div>
      )}

      {/* Submitting Interview Modal removed – submit now redirects immediately to completion page */}

      <div className="max-w-6xl mx-auto">
        {/* Camera Permission Notice */}
        {!cameraReady && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900 mb-1">Camera Access Required</h3>
                <p className="text-sm text-yellow-800">
                  This interview requires camera and microphone access. When prompted by your browser, please click
                  "Allow". Look for the camera icon in your browser's address bar if you need to change permissions.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Welcome Message - First Question Only */}
        {currentQuestionIndex === 0 && Object.keys(recordedVideos).length === 0 && (
          <div className="bg-linear-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold mb-2">Welcome to Your AI Interview! 👋</h2>
            <p className="text-blue-50 mb-4">
              You'll be answering {questions.length} questions. After each response, the interview will automatically
              advance to the next question. Good luck!
            </p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-2" />
                <span>Auto-Advance</span>
              </div>
              <div className="flex items-center">
                <Camera className="w-5 h-5 mr-2" />
                <span>Video Recorded</span>
              </div>
              <div className="flex items-center">
                <Loader2 className="w-5 h-5 mr-2" />
                <span>AI Analysis</span>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold">AI Video Interview</h1>
              <p className="text-gray-600">
                Applicant: {interview.applicant?.first_name} {interview.applicant?.last_name}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Progress</div>
              <div className="text-2xl font-bold text-blue-600">
                {Object.keys(recordedVideos).length}/{questions.length}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(Object.keys(recordedVideos).length / questions.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Video Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center">
                <Camera className="w-5 h-5 mr-2" />
                Camera
              </h2>
              {isRecording && (
                <div className="flex items-center text-red-600">
                  <Circle className="w-4 h-4 mr-2 fill-current animate-pulse" />
                  <span className="font-mono">{formatTime(recordingTime)}</span>
                </div>
              )}
            </div>

            {/* Webcam */}
            <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video mb-4">
              <Webcam
                ref={webcamRef}
                audio={true}
                audioConstraints={{
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                }}
                videoConstraints={{
                  facingMode: "user",
                }}
                muted={true}
                onUserMedia={(stream) => {
                  const audioTracks = stream.getAudioTracks();
                  const videoTracks = stream.getVideoTracks();
                  console.log("Media initialized - Audio tracks:", audioTracks.length);
                  console.log("Media initialized - Video tracks:", videoTracks.length);

                  if (audioTracks.length === 0) {
                    setError(
                      "Microphone not detected. Please check your browser permissions and allow microphone access."
                    );
                    setCameraReady(false);
                  } else {
                    console.log("Audio track settings:", audioTracks[0].getSettings());
                    console.log("Audio track enabled:", audioTracks[0].enabled);
                    setCameraReady(true);
                    setError("");
                  }
                }}
                onUserMediaError={(err) => {
                  console.error("Camera error:", err);
                  setCameraReady(false);
                  setError(
                    "Camera access denied. Please click the camera icon in your browser's address bar and allow camera and microphone access, then refresh the page."
                  );
                }}
                className="w-full h-full object-cover"
              />
              {!cameraReady && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="text-center text-white">
                    <VideoOff className="w-12 h-12 mx-auto mb-2" />
                    <p>Initializing camera...</p>
                    <p className="text-sm text-gray-400 mt-2">Please allow camera and microphone access</p>
                  </div>
                </div>
              )}
            </div>

            {/* Recording Controls */}
            <div className="space-y-3">
              {/* Status Display */}
              {isSpeaking && (
                <div className="w-full bg-blue-100 border border-blue-300 text-blue-800 py-3 rounded-lg font-semibold flex items-center justify-center">
                  <Volume2 className="w-5 h-5 mr-2 animate-pulse" />
                  Listening to Question...
                </div>
              )}

              {!isSpeaking && !isRecording && !isUploading && !isQuestionAnswered && (
                <div className="w-full bg-yellow-100 border border-yellow-300 text-yellow-800 py-3 rounded-lg font-semibold flex items-center justify-center">
                  <Circle className="w-5 h-5 mr-2 animate-pulse" />
                  Recording will start automatically...
                </div>
              )}

              {isRecording && (
                <button
                  onClick={stopRecording}
                  className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 flex items-center justify-center animate-pulse"
                >
                  <Square className="w-5 h-5 mr-2" />
                  Stop Recording
                </button>
              )}

              {!isRecording && recordedChunks.length > 0 && isUploading && (
                <div className="w-full bg-blue-100 border border-blue-300 text-blue-800 py-3 rounded-lg font-semibold flex items-center justify-center">
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Auto-uploading...
                </div>
              )}

              {isQuestionAnswered && (
                <div className="flex items-center justify-center text-green-600 font-medium py-3">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Question Answered ✓
                </div>
              )}
            </div>

            {/* Messages */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{error}</div>
            )}
            {successMessage && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                {successMessage}
              </div>
            )}
          </div>

          {/* Question Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div
              className={`mb-6 transition-all duration-500 ${
                isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm px-3 py-1 bg-blue-100 text-blue-800 rounded-full">
                    {currentQuestion?.question_type}
                  </span>
                  {/* Voice indicator */}
                  {isSpeaking && (
                    <span className="text-sm px-3 py-1 bg-green-100 text-green-800 rounded-full flex items-center animate-pulse">
                      <Volume2 className="w-4 h-4 mr-1" />
                      Speaking...
                    </span>
                  )}
                </div>
              </div>

              {/* Question Text with Replay Button */}
              <div className="flex items-start gap-3 mb-4">
                <h2 className="text-2xl font-bold text-gray-900 flex-1">{currentQuestion?.question_text}</h2>
                <button
                  onClick={() => speakQuestion(currentQuestion?.question_text)}
                  disabled={isSpeaking}
                  className="mt-1 p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Replay question audio"
                >
                  {isSpeaking ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              </div>

              {/* Tips */}
              <div className="bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-3">✨ Automatic Interview Flow:</h3>
                <ul className="text-sm text-blue-800 space-y-2">
                  <li className="flex items-start">
                    <span className="mr-2">1️⃣</span>
                    <span>AI reads the question aloud automatically</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">2️⃣</span>
                    <span>Recording starts automatically after question</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">3️⃣</span>
                    <span>Click "Stop Recording" when done answering</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">4️⃣</span>
                    <span>Video uploads and next question loads automatically</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">5️⃣</span>
                    <span>Interview submits automatically after last question</span>
                  </li>
                </ul>
                <div className="mt-3 pt-3 border-t border-blue-300">
                  <p className="text-xs text-blue-700 font-semibold">
                    💡 Just listen, answer, and click stop - we handle the rest!
                  </p>
                  <p className="mt-2 text-xs text-blue-700">
                    Note: If you close this tab before submitting your interview, some answers may not be saved and you
                    may need to restart.
                  </p>
                </div>
              </div>
            </div>

            {/* Submission Status */}
            <div className="space-y-4">
              {/* Show completion message and explicit submit when all questions are answered */}
              {Object.keys(recordedVideos).length === questions.length && (
                <>
                  <div className="w-full bg-green-100 border-2 border-green-400 text-green-800 py-4 rounded-lg font-semibold flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 mr-2" />
                    All questions completed! You&apos;re ready to submit your interview.
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSubmitInterview()}
                    disabled={isSubmitting}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Submitting your interview...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5 mr-2" />
                        Submit Interview
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

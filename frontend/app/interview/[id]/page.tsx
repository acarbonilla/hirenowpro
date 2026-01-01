"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Webcam from "react-webcam";
import { interviewAPI, api } from "@/lib/api";
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
  const resumeStorageKey = "resumeInterview";

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
    addRecordedVideo,
    answeredQuestions,
    setAnsweredQuestions,
    markQuestionAnswered,
  } = useStore();

  const [interview, setInterview] = useState<Interview | null>(currentInterview);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [deviceWarning, setDeviceWarning] = useState("");
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedAudioId, setSelectedAudioId] = useState("");
  const [showDeviceSelectors, setShowDeviceSelectors] = useState(false);
  const [videoConstraints, setVideoConstraints] = useState<MediaTrackConstraints | boolean>(true);
  const [audioConstraints, setAudioConstraints] = useState<MediaTrackConstraints | boolean>(true);
  const [forceDefaultConstraints, setForceDefaultConstraints] = useState(true);
  const [hasRetried, setHasRetried] = useState(false);
  const [webcamKey, setWebcamKey] = useState(0);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [permissionState, setPermissionState] = useState<"unknown" | "granted" | "denied" | "prompt">("unknown");
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showInitialCountdown, setShowInitialCountdown] = useState(true);
  const [initialCountdown, setInitialCountdown] = useState(5);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [silenceStage, setSilenceStage] = useState(0);
  const [silenceDuration, setSilenceDuration] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const silenceRafRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const silenceStageRef = useRef(0);
  const currentQuestionIdRef = useRef<number | null>(null);
  const silenceStatsRef = useRef<Record<number, { silence_duration: number; prompt_stage: number }>>({});
  const skipUploadRef = useRef(false);
  const noResponseTriggeredRef = useRef(false);
  const isRecordingRef = useRef(false);
  const stopRecordingRef = useRef<() => void>(() => {});

  const handleDataAvailable = useCallback(({ data }: BlobEvent) => {
    if (data.size > 0) {
      setRecordedChunks((prev) => [...prev, data]);
    }
  }, []);

  // Load interview and questions
  useEffect(() => {
    if (!interviewId) return;

    const fetchInterview = async () => {
      setIsLoading(true);
      setError("");

      try {
        const applicantToken = getApplicantToken();
        const config = applicantToken
          ? { headers: { Authorization: `Bearer ${applicantToken}` } }
          : undefined;
        const response = await interviewAPI.getInterview(interviewId, config);
        const data = response.data;
        const interview = data?.interview ?? data;

        if (!interview) {
          setError("Interview not found.");
          return;
        }

        if (interview.status === "expired") {
          setError("This interview has expired.");
          return;
        }

        if (process.env.NODE_ENV !== "production" && interview.id && interview.id !== interviewId) {
          console.error("Interview ID mismatch", { routeId: interviewId, payloadId: interview.id });
        }

        setInterview(interview);
        setCurrentInterview(interview);

        let interviewQuestions = Array.isArray(interview.questions) ? interview.questions : [];
        if (process.env.NODE_ENV !== "production") {
          interviewQuestions = interviewQuestions.slice(0, 5);
        }
        setQuestions(interviewQuestions);

        // Sync answered questions from backend truth
        const answeredIds = interview.answered_question_ids || [];
        setAnsweredQuestions(answeredIds);

        // Auto-advance to the last known progress point (server state or first unanswered)
        const firstUnansweredIndex = interviewQuestions.findIndex((q: InterviewQuestion) => !answeredIds.includes(q.id));
        const serverIndex = typeof interview.current_question_index === "number" ? interview.current_question_index : 0;
        const resumeIndex =
          firstUnansweredIndex >= 0 ? Math.max(serverIndex, firstUnansweredIndex) : serverIndex;

        if (resumeIndex > 0) {
          console.log("Auto-advancing to resume question index:", resumeIndex);
          setTimeout(() => {
            useStore.getState().setCurrentQuestionIndex(resumeIndex);
          }, 100);
        } else if (firstUnansweredIndex === -1 && interviewQuestions.length > 0) {
          setTimeout(() => {
            useStore.getState().setCurrentQuestionIndex(interviewQuestions.length - 1);
            setSuccessMessage("All questions have been answered.");
          }, 100);
        }

        if (!interviewQuestions.length) {
          setError("Interview questions are not available.");
        }
      } catch (err: any) {
        if (err?.response?.status === 404) {
          console.warn("Interview not found (404):", interviewId);
          setError("Interview not found or no longer available.");
          // Clear stale state from store
          setInterview(null);
          setCurrentInterview(null);
          setQuestions([]);
        } else {
          console.error("Fetch interview error:", err);
          setError(err?.message || "Failed to load interview.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchInterview();
  }, [interviewId]);

  useEffect(() => {
    if (questions.length > 0 && showInitialCountdown) {
      startInitialCountdown();
    }
  }, [questions.length]);

  useEffect(() => {
    let mounted = true;
    const checkPermission = async () => {
      if (!navigator?.permissions?.query) {
        setPermissionState("unknown");
        return;
      }
      try {
        const status = await navigator.permissions.query({ name: "camera" as PermissionName });
        if (!mounted) return;
        setPermissionState(status.state);
        if (status.state === "granted") {
          setCameraEnabled(true);
        }
        status.onchange = () => {
          if (!mounted) return;
          setPermissionState(status.state);
          if (status.state === "granted") {
            setCameraEnabled(true);
          }
        };
      } catch {
        setPermissionState("unknown");
      }
    };
    checkPermission();
    return () => {
      mounted = false;
    };
  }, []);

  const getMediaErrorMessage = (err: unknown) => {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotFoundError") {
      if (videoDevices.length === 0 && audioDevices.length === 0) {
        return "No camera or microphone detected. Plug in a camera/mic or enable them, then try again.";
      }
      if (videoDevices.length === 0) {
        return "No camera detected. Plug in or enable a camera, then try again.";
      }
      if (audioDevices.length === 0) {
        return "No microphone detected. Plug in or enable a microphone, then try again.";
      }
      return "Camera or microphone not detected. Please check your devices and try again.";
    }
    if (name === "NotAllowedError") return "Permission denied. Please allow camera and microphone access.";
    if (name === "OverconstrainedError") return "Selected device unavailable.";
    return "Could not access camera or microphone. Please try again.";
  };

  const refreshDevices = useCallback(async (stream: MediaStream) => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter(device => device.kind === "videoinput");
    const audios = devices.filter(device => device.kind === "audioinput");
    setVideoDevices(videos);
    setAudioDevices(audios);

    const currentVideoId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
    const currentAudioId = stream.getAudioTracks()[0]?.getSettings?.().deviceId;

    if (currentVideoId) {
      setSelectedVideoId(currentVideoId);
    } else if (!selectedVideoId && videos.length > 0) {
      setSelectedVideoId(videos[0].deviceId);
    }

    if (currentAudioId) {
      setSelectedAudioId(currentAudioId);
    } else if (!selectedAudioId && audios.length > 0) {
      setSelectedAudioId(audios[0].deviceId);
    }
  }, [selectedAudioId, selectedVideoId]);

  useEffect(() => {
    if (forceDefaultConstraints) {
      setVideoConstraints(true);
      setAudioConstraints(true);
      return;
    }

    const videoValid = selectedVideoId && videoDevices.some(device => device.deviceId === selectedVideoId);
    const audioValid = selectedAudioId && audioDevices.some(device => device.deviceId === selectedAudioId);

    setVideoConstraints(videoValid ? { deviceId: { exact: selectedVideoId } } : true);
    setAudioConstraints(audioValid ? { deviceId: { exact: selectedAudioId } } : true);
  }, [forceDefaultConstraints, selectedVideoId, selectedAudioId, videoDevices, audioDevices]);

  const retryCamera = useCallback(() => {
    setForceDefaultConstraints(true);
    setHasRetried(false);
    setDeviceWarning("");
    setCameraError("");
    setWebcamKey(prev => prev + 1);
    setCameraEnabled(true);
  }, []);

  const handleEnableCamera = () => {
    setPermissionLoading(true);
    setCameraError("");
    setDeviceWarning("");
    setForceDefaultConstraints(true);
    setHasRetried(false);
    setCameraEnabled(true);
    setWebcamKey(prev => prev + 1);
    setTimeout(() => setPermissionLoading(false), 300);
  };

  const SILENCE_THRESHOLD = 0.02;
  const SILENCE_STAGE_MS = {
    gentle: 5000,
    supportive: 8000,
    options: 12000,
    autoStop: 20000,
  };

  const stopSilenceDetection = useCallback(() => {
    if (silenceRafRef.current !== null) {
      cancelAnimationFrame(silenceRafRef.current);
      silenceRafRef.current = null;
    }
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch {
        // Ignore cleanup errors.
      }
      audioSourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    audioDataRef.current = null;
    silenceStartRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopSilenceDetection();
  }, [stopSilenceDetection]);

  const startSilenceDetection = useCallback((stream: MediaStream) => {
    if (audioContextRef.current || !stream.getAudioTracks().length) {
      return;
    }

    try {
      const AudioContextCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;

      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray: Uint8Array<ArrayBuffer> = new Uint8Array(analyser.fftSize);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      audioSourceRef.current = source;
      audioDataRef.current = dataArray;
      silenceStartRef.current = null;
      silenceStageRef.current = 0;
      noResponseTriggeredRef.current = false;
      setSilenceStage(0);
      setSilenceDuration(0);

      const tick = () => {
        if (!isRecordingRef.current || !analyserRef.current || !audioDataRef.current) {
          return;
        }

        analyserRef.current.getByteTimeDomainData(audioDataRef.current);
        let sum = 0;
        for (let i = 0; i < audioDataRef.current.length; i += 1) {
          const normalized = (audioDataRef.current[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / audioDataRef.current.length);
        const now = performance.now();

        if (rms < SILENCE_THRESHOLD) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          }
          const silentMs = now - silenceStartRef.current;
          const silentSeconds = Math.floor(silentMs / 1000);

          let stage = 0;
          if (silentMs >= SILENCE_STAGE_MS.autoStop) {
            stage = 4;
          } else if (silentMs >= SILENCE_STAGE_MS.options) {
            stage = 3;
          } else if (silentMs >= SILENCE_STAGE_MS.supportive) {
            stage = 2;
          } else if (silentMs >= SILENCE_STAGE_MS.gentle) {
            stage = 1;
          }

          if (stage !== silenceStageRef.current) {
            silenceStageRef.current = stage;
            setSilenceStage(stage);
          }
          setSilenceDuration(silentSeconds);

          const questionId = currentQuestionIdRef.current;
          if (questionId) {
            silenceStatsRef.current[questionId] = {
              silence_duration: silentSeconds,
              prompt_stage: stage,
            };
          }

          if (stage === 4 && !noResponseTriggeredRef.current) {
            noResponseTriggeredRef.current = true;
            setSuccessMessage("No response recorded for this question. Continuing.");
            setTimeout(() => stopRecordingRef.current(), 0);
          }
        } else {
          silenceStartRef.current = null;
          if (silenceStageRef.current !== 0) {
            silenceStageRef.current = 0;
            setSilenceStage(0);
          }
          if (silenceDuration !== 0) {
            setSilenceDuration(0);
          }
        }

        silenceRafRef.current = requestAnimationFrame(tick);
      };

      silenceRafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.warn("Silence detection unavailable", err);
    }
  }, [silenceDuration, stopSilenceDetection]);

  const startRecording = useCallback(() => {
    if (!webcamRef.current?.stream) {
      setError("Camera not ready. Please allow camera access.");
      return;
    }
    const activeQuestion = questions[currentQuestionIndex];
    if (activeQuestion && answeredQuestions.has(activeQuestion.id)) {
      setError("This question is already answered. Please continue to the next question.");
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
    startSilenceDetection(webcamRef.current.stream);

    console.log("MediaRecorder started with state:", mediaRecorder.state);
  }, [handleDataAvailable, startSilenceDetection]);

  // Initial countdown before first question
  const startInitialCountdown = useCallback(() => {
    let countdown = 5;
    setInitialCountdown(countdown);
    setShowInitialCountdown(true);

    const countdownInterval = setInterval(() => {
      countdown--;
      setInitialCountdown(countdown);

      if (countdown <= 0) {
        clearInterval(countdownInterval);
        setShowInitialCountdown(false);
      }
    }, 1000);
  }, []);

  // Text-to-speech function
  const speakQuestion = useCallback((text: string, questionId?: number) => {
    if (!text) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find((voice) => /female|woman|wavenet[- ]?f/i.test(voice.name));
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    } else if (voices[0]) {
      utterance.voice = voices[0];
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Auto-start recording after voice finishes (1 second delay)
        setTimeout(() => {
        // Get the question ID to check - use parameter if provided, otherwise current question
        const qId = questionId || questions[currentQuestionIndex]?.id;
        const alreadyRecorded = qId && answeredQuestions.has(qId);

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
  }, [questions, currentQuestionIndex, answeredQuestions, cameraReady, isRecording, startRecording]);

  // Speak question when it changes
  useEffect(() => {
    if (!showInitialCountdown && questions[currentQuestionIndex]) {
      // Small delay before speaking to let UI settle
      const timer = setTimeout(() => {
        const currentQuestion = questions[currentQuestionIndex];
        speakQuestion(currentQuestion.question_text, currentQuestion.id);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentQuestionIndex, showInitialCountdown, questions]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording, stopSilenceDetection]);

  useEffect(() => {
    const currentQuestion = questions[currentQuestionIndex];
    currentQuestionIdRef.current = currentQuestion ? currentQuestion.id : null;
    silenceStartRef.current = null;
    silenceStageRef.current = 0;
    noResponseTriggeredRef.current = false;
    setSilenceStage(0);
    setSilenceDuration(0);
  }, [currentQuestionIndex, questions]);

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

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    stopSilenceDetection();
  }, [isRecording, stopSilenceDetection]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  const handleSilenceStartAnswer = () => {
    silenceStartRef.current = performance.now();
    silenceStageRef.current = 0;
    setSilenceStage(0);
    setSilenceDuration(0);
  };

  const handleSilenceRepeatQuestion = () => {
    setSuccessMessage("The question is displayed above. Take your time.");
  };

  const handleSilenceSkip = () => {
    if (!isRecordingRef.current) return;
    skipUploadRef.current = true;
    setSuccessMessage("Skipping this question for now.");
    stopRecordingRef.current();
  };

  // Auto-upload when recording stops and chunks are ready
  useEffect(() => {
    if (!isRecording && recordedChunks.length > 0 && !isUploading) {
      if (skipUploadRef.current) {
        skipUploadRef.current = false;
        setRecordedChunks([]);
        setSuccessMessage("Question skipped. You can answer it later.");
        if (currentQuestionIndex < questions.length - 1) {
          nextQuestion();
        }
        return;
      }
      const timer = setTimeout(() => {
        handleUploadVideo();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isRecording, recordedChunks.length, isUploading, currentQuestionIndex, questions.length, nextQuestion]);

  useEffect(() => {
    if (!isRecording && recordedChunks.length === 0 && skipUploadRef.current && !isUploading) {
      skipUploadRef.current = false;
      setSuccessMessage("Question skipped. You can answer it later.");
      if (currentQuestionIndex < questions.length - 1) {
        nextQuestion();
      }
    }
  }, [isRecording, recordedChunks.length, isUploading, currentQuestionIndex, questions.length, nextQuestion]);

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
      const uploadResponse = await interviewAPI.uploadVideoResponse(interviewId, formData);

      console.log("Video uploaded successfully!", uploadResponse?.data);

      const transcript = uploadResponse?.data?.video_response?.transcript;
      const errorDetail = uploadResponse?.data?.transcription_error;

      if (!transcript || (typeof transcript === "string" && !transcript.trim())) {
        console.warn("Transcript unavailable, continuing. Details:", errorDetail);
      }

      // Persist response locally
      addRecordedVideo(currentQuestion.id, blob);
      const alreadyAnswered = answeredQuestions.has(currentQuestion.id);
      markQuestionAnswered(currentQuestion.id);

      const isLastQuestion = currentQuestionIndex >= questions.length - 1;
      const totalAnswered = alreadyAnswered ? answeredQuestions.size : answeredQuestions.size + 1;

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

      // Automatically advance to next question OR auto-submit if last
      if (!isLastQuestion) {
        setSuccessMessage("");
        nextQuestion();
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

      if (err.response?.status === 404) {
        setError("Upload failed: The interview session was not found on the server.");
      } else {
        setError(`Upload failed: ${errorMessage}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitInterview = async (skipValidation = false) => {
    // Check if all questions are answered (unless skipping validation for auto-submit)
    const answeredCount = answeredQuestions.size;
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

    // Keep submit snappy for the applicant; disable button briefly to prevent double-clicks
    setIsSubmitting(true);
    setError("");

    try {
      const applicantToken = getApplicantToken();
      if (!applicantToken) {
        setError("Unable to submit interview: missing applicant session. Please reopen your interview link.");
        setIsSubmitting(false);
        return;
      }

      console.log("Submitting interview:", interviewId);
      console.log("Questions answered:", answeredCount, "of", questions.length);

      await api.post(
        `/public/interviews/${interviewId}/submit/`,
        undefined,
        { headers: { Authorization: `Bearer ${applicantToken}` } }
      );

      console.log("Interview submitted successfully! Redirecting to completion page...");
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(resumeStorageKey);
      }
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

  if (!interview || !interview.id) {
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
  const isQuestionAnswered = currentQuestion ? answeredQuestions.has(currentQuestion.id) : false;
  const allQuestionsAnswered = questions.length > 0 && answeredQuestions.size === questions.length;

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

      {/* Submitting Interview Modal removed – submit now redirects immediately to completion page */}

      <div className="max-w-6xl mx-auto">
        {/* Camera Permission Notice */}
        {!cameraReady && !cameraEnabled && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900 mb-1">Camera Access Required</h3>
                <p className="text-sm text-yellow-800">
                  This interview requires camera and microphone access. When prompted by your browser, please click
                  "Allow". Look for the camera icon in your browser's address bar if you need to change permissions.
                </p>
                <button
                  onClick={handleEnableCamera}
                  className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm"
                  disabled={permissionLoading}
                >
                  {permissionLoading ? "Requesting access..." : "Enable Camera & Start Interview"}
                </button>
                {permissionState === "denied" && (
                  <p className="text-xs text-yellow-800 mt-2">
                    Your browser is currently blocking camera access. Use the camera icon in the address bar to allow
                    access, then click the button again.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Welcome Message - First Question Only */}
        {currentQuestionIndex === 0 && answeredQuestions.size === 0 && (
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
                {answeredQuestions.size}/{questions.length}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(answeredQuestions.size / questions.length) * 100}%` }}
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
              {cameraEnabled ? (
                <Webcam
                  key={webcamKey}
                  ref={webcamRef}
                  audio={true}
                  audioConstraints={audioConstraints}
                  videoConstraints={videoConstraints}
                  muted={true}
                  onUserMedia={(stream) => {
                    setCameraError("");
                    setDeviceWarning("");
                    const audioTracks = stream.getAudioTracks();
                    const videoTracks = stream.getVideoTracks();
                    console.log("Media initialized - Audio tracks:", audioTracks.length);
                    console.log("Media initialized - Video tracks:", videoTracks.length);
                    refreshDevices(stream);
                    setForceDefaultConstraints(false);
                    setHasRetried(false);

                  if (audioTracks.length === 0) {
                    setCameraError("No microphone detected. Plug in or enable a microphone, then try again.");
                    setCameraReady(false);
                    setShowDeviceSelectors(true);
                  } else if (videoTracks.length === 0) {
                    setCameraError("No camera detected. Plug in or enable a camera, then try again.");
                    setCameraReady(false);
                    setShowDeviceSelectors(true);
                  } else {
                    console.log("Audio track settings:", audioTracks[0].getSettings());
                    console.log("Audio track enabled:", audioTracks[0].enabled);
                    setCameraReady(true);
                    setCameraError("");
                  }
                }}
                onUserMediaError={(err) => {
                  console.error("Camera error:", err);
                  setCameraReady(false);
                  setCameraError(getMediaErrorMessage(err));
                  setShowDeviceSelectors(true);
                  const shouldRetryWithDefaults =
                    err instanceof DOMException &&
                    (err.name === "NotFoundError" || err.name === "OverconstrainedError");

                  if (!hasRetried && shouldRetryWithDefaults) {
                    setHasRetried(true);
                    setDeviceWarning("Retrying with default camera and microphone.");
                    setForceDefaultConstraints(true);
                      setSelectedVideoId("");
                      setSelectedAudioId("");
                      setWebcamKey(prev => prev + 1);
                    }
                  }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="text-center text-white">
                    <VideoOff className="w-12 h-12 mx-auto mb-2" />
                    <p>Camera access required</p>
                    <p className="text-sm text-gray-400 mt-2">Click "Enable Camera & Start Interview" to begin</p>
                  </div>
                </div>
              )}
              {!cameraReady && cameraEnabled && !error && !cameraError && (
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
              {(videoDevices.length > 1 || audioDevices.length > 1) && showDeviceSelectors && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Camera</label>
                    <select
                      value={selectedVideoId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSelectedVideoId(nextId);
                        setForceDefaultConstraints(false);
                        setWebcamKey(prev => prev + 1);
                      }}
                      className="w-full bg-gray-100 text-sm px-2 py-1 rounded border border-gray-300"
                    >
                      {videoDevices.map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || "Camera"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Microphone</label>
                    <select
                      value={selectedAudioId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSelectedAudioId(nextId);
                        setForceDefaultConstraints(false);
                        setWebcamKey(prev => prev + 1);
                      }}
                      className="w-full bg-gray-100 text-sm px-2 py-1 rounded border border-gray-300"
                    >
                      {audioDevices.map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || "Microphone"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {!showDeviceSelectors && (videoDevices.length > 1 || audioDevices.length > 1) && (
                <button
                  type="button"
                  onClick={() => setShowDeviceSelectors(true)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Having trouble?
                </button>
              )}
              {deviceWarning && (
                <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                  {deviceWarning}
                </div>
              )}
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
            {cameraError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                {cameraError}
                <div className="mt-3">
                  <button
                    onClick={retryCamera}
                    className="px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 text-xs"
                  >
                    Retry Camera
                  </button>
                </div>
              </div>
            )}
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
            <div className="mb-6">
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

              {isRecording && !isSpeaking && silenceStage > 0 && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  {silenceStage === 1 && <p>You may begin when you are ready.</p>}
                  {silenceStage === 2 && (
                    <p>You can answer briefly. A step-by-step outline is enough.</p>
                  )}
                  {silenceStage === 3 && (
                    <>
                      <p>If you need a moment, choose an option below.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleSilenceStartAnswer}
                          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          Start Answer
                        </button>
                        <button
                          type="button"
                          onClick={handleSilenceRepeatQuestion}
                          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          Repeat Question
                        </button>
                        <button
                          type="button"
                          onClick={handleSilenceSkip}
                          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          Skip (answer later)
                        </button>
                      </div>
                    </>
                  )}
                  {silenceStage >= 4 && (
                    <p>No response recorded. We will continue to the next question.</p>
                  )}
                </div>
              )}

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
              {answeredQuestions.size === questions.length && (
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
                    <Send className="w-5 h-5 mr-2" />
                    {isSubmitting ? "Submitting..." : "Submit Interview"}
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

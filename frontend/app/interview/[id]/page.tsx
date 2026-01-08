"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Webcam from "react-webcam";
import { interviewAPI, api, API_BASE_URL } from "@/lib/api";
import { getApplicantToken } from "@/app/utils/auth-applicant";
import { useStore } from "@/store/useStore";
import { ttsService, TTS_PROVIDER } from "@/lib/ttsService";
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

type IntegrityMetadata = {
  fullscreen: {
    supported: boolean;
    exit_count: number;
    exit_timestamps: string[];
    not_supported_count: number;
    not_supported_timestamps: string[];
  };
  focus: {
    blur_count: number;
    total_blur_seconds: number;
  };
  tab_switches: {
    count: number;
  };
  refresh: {
    count: number;
  };
  consent_acknowledged_at: string | null;
  captured_at?: string;
};

const TTS_CONFIG = {
  voice_gender: "female",
  voice_id: "",
  language: "en-US",
  rate: 0.92,
  pitch: -0.3,
  volume: 1.0,
  sentence_pause_ms: 180,
  prosody: "neutral",
};

// ─────────────────────
// Utilities
// ─────────────────────
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

export default function InterviewPage() {
  // ─────────────────────
  // Hooks: State + Refs
  // ─────────────────────
  const params = useParams();
  const router = useRouter();
  const interviewId = parseInt(params.id as string);
  const resumeStorageKey = `resumeInterview:${interviewId}`;
  const integrityConsentStorageKey = `integrityConsent:${interviewId}`;

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
  const [audioLevel, setAudioLevel] = useState(0);
  const [micState, setMicState] = useState<"active" | "muted" | "blocked">("active");
  const [showIntegrityConsent, setShowIntegrityConsent] = useState(true);
  const [integrityConsentChecked, setIntegrityConsentChecked] = useState(false);
  const [integrityAcknowledged, setIntegrityAcknowledged] = useState(false);
  const [showFullscreenWarning, setShowFullscreenWarning] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const silenceRafRef = useRef<number | null>(null);
  const silenceElapsedRef = useRef(0);
  const silenceLastTickRef = useRef<number | null>(null);
  const silenceStageRef = useRef(0);
  const currentQuestionIdRef = useRef<number | null>(null);
  const silenceStatsRef = useRef<Record<number, { silence_duration: number; prompt_stage: number }>>({});
  const skipUploadRef = useRef(false);
  const noResponseTriggeredRef = useRef(false);
  const isRecordingRef = useRef(false);
  const stopRecordingRef = useRef<() => void>(() => {});
  const interviewContainerRef = useRef<HTMLDivElement | null>(null);
  const integrityRef = useRef<IntegrityMetadata>({
    fullscreen: {
      supported: true,
      exit_count: 0,
      exit_timestamps: [],
      not_supported_count: 0,
      not_supported_timestamps: [],
    },
    focus: {
      blur_count: 0,
      total_blur_seconds: 0,
    },
    tab_switches: {
      count: 0,
    },
    refresh: {
      count: 0,
    },
    consent_acknowledged_at: null,
  });
  const lastSentIntegrityRef = useRef<IntegrityMetadata | null>(null);
  const integrityActiveRef = useRef(false);
  const focusLossActiveRef = useRef(false);
  const focusLossStartRef = useRef<number | null>(null);
  const hadFullscreenRef = useRef(false);
  const fullscreenRequestedRef = useRef(false);
  const micStateRef = useRef<"active" | "muted" | "blocked">("active");
  const audioLevelRef = useRef(0);

  // ─────────────────────
  // Hook-safe Helpers
  // ─────────────────────
  const handleDataAvailable = useCallback(({ data }: BlobEvent) => {
    if (data.size > 0) {
      setRecordedChunks((prev) => [...prev, data]);
    }
  }, []);

  const buildIntegrityPayload = () => {
    const base = integrityRef.current;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    let blurSeconds = base.focus.total_blur_seconds;
    if (focusLossActiveRef.current && focusLossStartRef.current !== null) {
      blurSeconds += Math.max(0, (now - focusLossStartRef.current) / 1000);
    }
    return {
      ...base,
      focus: {
        ...base.focus,
        total_blur_seconds: Math.round(blurSeconds),
      },
      captured_at: new Date().toISOString(),
    };
  };

  const persistIntegrity = useCallback(
    async (mode: "checkpoint" | "submit" | "unload" = "checkpoint") => {
      if (!integrityActiveRef.current || !interviewId) return;
      const payload = buildIntegrityPayload();
      const comparablePayload = { ...payload, captured_at: undefined };
      if (
        lastSentIntegrityRef.current &&
        JSON.stringify({ ...lastSentIntegrityRef.current, captured_at: undefined }) === JSON.stringify(comparablePayload)
      ) {
        return;
      }
      lastSentIntegrityRef.current = payload;

      const requestBody = { integrity: payload };
      if (mode === "unload" && typeof navigator !== "undefined" && navigator.sendBeacon) {
        try {
          const url = `${API_BASE_URL}/public/interviews/${interviewId}/integrity/`;
          const blob = new Blob([JSON.stringify(requestBody)], { type: "application/json" });
          navigator.sendBeacon(url, blob);
          return;
        } catch {
          // Fall through to async call.
        }
      }

      try {
        await api.post(`/public/interviews/${interviewId}/integrity/`, requestBody);
      } catch (err) {
        console.warn("Integrity logging failed", err);
      }
    },
    [interviewId]
  );

  const handleIntegrityAcknowledge = () => {
    const timestamp = new Date().toISOString();
    integrityRef.current.consent_acknowledged_at = timestamp;
    integrityActiveRef.current = true;
    setIntegrityAcknowledged(true);
    setShowIntegrityConsent(false);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(integrityConsentStorageKey, timestamp);
    }
    persistIntegrity("checkpoint");
  };

  const requestInterviewFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    const target = interviewContainerRef.current ?? document.documentElement;
    if (!target?.requestFullscreen) {
      integrityRef.current.fullscreen.supported = false;
      integrityRef.current.fullscreen.not_supported_count += 1;
      integrityRef.current.fullscreen.not_supported_timestamps.push(new Date().toISOString());
      return;
    }
    fullscreenRequestedRef.current = true;
    try {
      await target.requestFullscreen();
      integrityRef.current.fullscreen.supported = true;
    } catch (err) {
      console.warn("Fullscreen request failed", err);
      integrityRef.current.fullscreen.supported = false;
      integrityRef.current.fullscreen.not_supported_count += 1;
      integrityRef.current.fullscreen.not_supported_timestamps.push(new Date().toISOString());
    }
  }, []);

  const startFocusLoss = useCallback((source: "blur" | "hidden") => {
    if (focusLossActiveRef.current || !integrityActiveRef.current) return;
    focusLossActiveRef.current = true;
    focusLossStartRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    integrityRef.current.focus.blur_count += 1;
    if (source === "hidden") {
      integrityRef.current.tab_switches.count += 1;
    }
  }, []);

  const endFocusLoss = useCallback((source: "focus" | "visible") => {
    if (!focusLossActiveRef.current || !integrityActiveRef.current) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const start = focusLossStartRef.current ?? now;
    const blurSeconds = Math.max(0, (now - start) / 1000);
    integrityRef.current.focus.total_blur_seconds += blurSeconds;
    focusLossActiveRef.current = false;
    focusLossStartRef.current = null;
  }, []);

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

  // ─────────────────────
  // Effects
  // ─────────────────────
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
    if (integrityAcknowledged && questions.length > 0 && showInitialCountdown) {
      startInitialCountdown();
    }
  }, [integrityAcknowledged, questions.length, showInitialCountdown, startInitialCountdown]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedConsent = sessionStorage.getItem(integrityConsentStorageKey);
    if (storedConsent) {
      integrityRef.current.consent_acknowledged_at = storedConsent;
      integrityActiveRef.current = true;
      setIntegrityAcknowledged(true);
      setShowIntegrityConsent(false);
    }
  }, [integrityConsentStorageKey]);

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

  useEffect(() => {
    if (typeof document === "undefined") return;
    integrityRef.current.fullscreen.supported = !!document.documentElement?.requestFullscreen;
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!integrityActiveRef.current) return;
      const isFullscreen = !!document.fullscreenElement;
      if (isFullscreen) {
        hadFullscreenRef.current = true;
        return;
      }
      if (!fullscreenRequestedRef.current || !hadFullscreenRef.current) return;
      const timestamp = new Date().toISOString();
      integrityRef.current.fullscreen.exit_count += 1;
      integrityRef.current.fullscreen.exit_timestamps.push(timestamp);
      if (integrityRef.current.fullscreen.exit_count === 1) {
        setShowFullscreenWarning(true);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (!integrityActiveRef.current) return;
        if (focusLossActiveRef.current) {
          integrityRef.current.tab_switches.count += 1;
          return;
        }
        startFocusLoss("hidden");
        return;
      }
      endFocusLoss("visible");
    };
    const handleBlur = () => startFocusLoss("blur");
    const handleFocus = () => endFocusLoss("focus");

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [startFocusLoss, endFocusLoss]);

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      event.preventDefault();
    };
    const handlePaste = (event: ClipboardEvent) => {
      event.preventDefault();
    };
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  // ─────────────────────
  // Event Handlers
  // ─────────────────────
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
    if (!integrityAcknowledged) {
      setShowIntegrityConsent(true);
      return;
    }
    requestInterviewFullscreen();
    setPermissionLoading(true);
    setCameraError("");
    setDeviceWarning("");
    setForceDefaultConstraints(true);
    setHasRetried(false);
    setCameraEnabled(true);
    setWebcamKey(prev => prev + 1);
    setTimeout(() => setPermissionLoading(false), 300);
  };

  useEffect(() => {
    if (!integrityAcknowledged || typeof window === "undefined") return;
    const wasReloaded = sessionStorage.getItem(resumeStorageKey);
    if (wasReloaded) {
      integrityRef.current.refresh.count += 1;
      sessionStorage.removeItem(resumeStorageKey);
      persistIntegrity("checkpoint");
    }
  }, [integrityAcknowledged, resumeStorageKey, persistIntegrity]);

  useEffect(() => {
    const handlePageHide = () => {
      if (!integrityActiveRef.current || typeof window === "undefined") return;
      sessionStorage.setItem(resumeStorageKey, "1");
      persistIntegrity("unload");
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [resumeStorageKey, persistIntegrity]);

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
    silenceElapsedRef.current = 0;
    silenceLastTickRef.current = null;
    audioLevelRef.current = 0;
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    return () => stopSilenceDetection();
  }, [stopSilenceDetection]);

  const startSilenceDetection = useCallback((stream: MediaStream) => {
    if (audioContextRef.current) {
      return;
    }

    try {
      if (stream.getAudioTracks().length) {
        const AudioContextCtor =
          window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor) {
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
        }
      }

      silenceElapsedRef.current = 0;
      silenceLastTickRef.current = null;
      silenceStageRef.current = 0;
      noResponseTriggeredRef.current = false;
      setSilenceStage(0);
      setSilenceDuration(0);
      setAudioLevel(0);

      const tick = () => {
        if (!isRecordingRef.current) {
          return;
        }

        const now = performance.now();
        const lastTick = silenceLastTickRef.current ?? now;
        const deltaMs = Math.max(0, now - lastTick);
        silenceLastTickRef.current = now;

        const audioTrack = stream.getAudioTracks()[0];
        const micMuted = !audioTrack || audioTrack.enabled === false;
        let rms = 0;
        let speaking = false;

        if (!micMuted && analyserRef.current && audioDataRef.current) {
          analyserRef.current.getByteTimeDomainData(audioDataRef.current);
          let sum = 0;
          for (let i = 0; i < audioDataRef.current.length; i += 1) {
            const normalized = (audioDataRef.current[i] - 128) / 128;
            sum += normalized * normalized;
          }
          rms = Math.sqrt(sum / audioDataRef.current.length);
          speaking = rms >= SILENCE_THRESHOLD;
        }
        const nextAudioLevel = micMuted ? 0 : Math.min(100, Math.round((rms / 0.2) * 100));
        if (nextAudioLevel !== audioLevelRef.current) {
          audioLevelRef.current = nextAudioLevel;
          setAudioLevel(nextAudioLevel);
        }

        const nextMicState: "active" | "muted" | "blocked" =
          permissionState === "denied" ? "blocked" : micMuted ? "muted" : "active";
        if (nextMicState !== micStateRef.current) {
          micStateRef.current = nextMicState;
          setMicState(nextMicState);
        }

        if (micMuted || !speaking) {
          silenceElapsedRef.current += deltaMs;
          const silentMs = silenceElapsedRef.current;
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
          silenceElapsedRef.current = 0;
          silenceLastTickRef.current = now;
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
  }, [permissionState, silenceDuration, stopSilenceDetection]);

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

  const speak = useCallback(
    (text: string, handlers?: { onEnd?: () => void; onError?: () => void }, cacheKey?: string) => {
      if (!text) return false;
      // Web Speech API is intentionally disabled for interview TTS.
      if (TTS_PROVIDER !== "deepgram") {
        throw new Error("TTS provider must be deepgram");
      }
      if (!interviewId || Number.isNaN(interviewId)) {
        setError("Audio unavailable.");
        handlers?.onError?.();
        return false;
      }

      void ttsService
        .speak({
          interviewId,
          text,
          cacheKey,
          onStart: () => setIsSpeaking(true),
          onEnd: () => {
            setIsSpeaking(false);
            handlers?.onEnd?.();
          },
          onError: () => {
            setIsSpeaking(false);
            setError("Audio unavailable.");
            handlers?.onError?.();
          },
        })
        .then((didSpeak) => {
          if (!didSpeak) {
            setError("Audio unavailable.");
            handlers?.onError?.();
          }
        });

      return true;
    },
    [interviewId]
  );

  // Text-to-speech function
  const speakQuestion = useCallback(
    (text: string, questionId?: number) => {
      if (!text) return;

      const handleAutoStart = () => {
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
      };

      const cacheKey = questionId ? `question:${questionId}` : undefined;
      const didSpeak = speak(
        text,
        {
        onEnd: () => {
          setTimeout(handleAutoStart, 1000);
        },
        onError: () => {
          setTimeout(handleAutoStart, 500);
        },
      },
      cacheKey
      );
      if (!didSpeak) {
        setTimeout(handleAutoStart, 500);
      }
    },
    [answeredQuestions, cameraReady, currentQuestionIndex, isRecording, questions, speak, startRecording]
  );

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
    silenceElapsedRef.current = 0;
    silenceLastTickRef.current = null;
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
    silenceElapsedRef.current = 0;
    silenceLastTickRef.current = performance.now();
    silenceStageRef.current = 0;
    noResponseTriggeredRef.current = false;
    setSilenceStage(0);
    setSilenceDuration(0);
  };

  const handleSilenceRepeatQuestion = () => {
    setSuccessMessage("The question is displayed above. Take your time.");
    silenceElapsedRef.current = 0;
    silenceLastTickRef.current = performance.now();
    silenceStageRef.current = 0;
    noResponseTriggeredRef.current = false;
    setSilenceStage(0);
    setSilenceDuration(0);
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
      for (const pair of formData.entries()) {
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
      persistIntegrity("checkpoint");

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

        const integrityPayload = buildIntegrityPayload();
        await api.post(
          `/public/interviews/${interviewId}/submit/`,
          { integrity: integrityPayload },
          { headers: { Authorization: `Bearer ${applicantToken}` } }
        );

        console.log("Interview submitted successfully! Redirecting to completion page...");
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(resumeStorageKey);
          sessionStorage.removeItem(integrityConsentStorageKey);
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

  // ─────────────────────
  // Render
  // ─────────────────────
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
  const micStateLabel =
    micState === "blocked" ? "Permission blocked" : micState === "muted" ? "Muted" : "Active";
  const micStateClass =
    micState === "blocked" ? "text-red-700" : micState === "muted" ? "text-yellow-700" : "text-green-700";
  const micBarClass =
    micState === "blocked" ? "bg-red-500" : micState === "muted" ? "bg-yellow-500" : "bg-green-500";
  const audioLevelWidth = `${Math.min(100, Math.max(0, audioLevel))}%`;

  return (
    <div ref={interviewContainerRef} className="min-h-screen bg-gray-50 py-8 px-4 relative">
      {showIntegrityConsent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-gray-900">Interview Integrity Notice</h2>
            <p className="mt-2 text-sm text-gray-700">
              To support interview integrity, this session records when the interview tab loses focus and when
              fullscreen exits. The interview will not be blocked, and these signals are advisory for HR review only.
            </p>
            <p className="mt-2 text-sm text-gray-700">
              Please stay on this tab and in fullscreen when possible.
            </p>
            <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={integrityConsentChecked}
                onChange={(event) => setIntegrityConsentChecked(event.target.checked)}
              />
              <span>I understand and want to continue.</span>
            </label>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleIntegrityAcknowledge}
                disabled={!integrityConsentChecked}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                  integrityConsentChecked ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-300 cursor-not-allowed"
                }`}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      {showFullscreenWarning && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">Fullscreen exited</p>
              <p className="text-xs text-yellow-800">
                Please stay in fullscreen when possible. Your interview will continue either way.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowFullscreenWarning(false);
                  requestInterviewFullscreen();
                }}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Return to fullscreen
              </button>
              <button
                type="button"
                onClick={() => setShowFullscreenWarning(false)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Initial Countdown Overlay - Before First Question */}
      {showInitialCountdown && integrityAcknowledged && (
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
                    disabled={permissionLoading || !integrityAcknowledged}
                  >
                    {permissionLoading ? "Requesting access..." : "Enable Camera & Start Interview"}
                  </button>
                  {!integrityAcknowledged && (
                    <p className="text-xs text-yellow-800 mt-2">
                      Please acknowledge the integrity notice to begin.
                    </p>
                  )}
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
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Microphone</p>
                    <p className={`text-sm font-semibold ${micStateClass}`}>{micStateLabel}</p>
                  </div>
                  <span className="text-xs text-gray-500">Audio level</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className={`${micBarClass} h-2 rounded-full transition-all duration-150`}
                    style={{ width: audioLevelWidth }}
                  />
                </div>
              </div>
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

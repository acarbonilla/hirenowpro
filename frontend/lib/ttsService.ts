import axios from "axios";
import { API_BASE_URL } from "@/lib/apiBase";
const VOICE_ID = "thalia";
const LANGUAGE = "en-US";
export const TTS_PROVIDER = "deepgram";
export const TTS_MODEL = "aura-2-thalia-en";

type SpeakHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
};

type SpeakOptions = SpeakHandlers & {
  interviewId: number;
  text: string;
  cacheKey?: string;
};

const audioCache = new Map<string, ArrayBuffer>();
const inflight = new Map<string, Promise<ArrayBuffer>>();
let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;
let activeToken = 0;

const stopCurrentAudio = () => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio.onended = null;
    currentAudio.onerror = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  currentAudio = null;
};

const buildCacheKey = (text: string, cacheKey?: string) => {
  if (cacheKey) return `${VOICE_ID}|${LANGUAGE}|${cacheKey}`;
  return `${VOICE_ID}|${LANGUAGE}|${text}`;
};

const fetchAudio = async (interviewId: number, text: string, cacheKey?: string) => {
  const key = buildCacheKey(text, cacheKey);
  const cached = audioCache.get(key);
  if (cached) return cached;

  const inflightRequest = inflight.get(key);
  if (inflightRequest) return inflightRequest;

  const request = axios
    .post(
      `${API_BASE_URL}/public/interviews/${interviewId}/tts/`,
      { text },
      { responseType: "arraybuffer", timeout: 20000 }
    )
    .then((response) => {
      audioCache.set(key, response.data);
      return response.data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
};

export const ttsService = {
  async speak({ interviewId, text, cacheKey, onStart, onEnd, onError }: SpeakOptions) {
    if (TTS_PROVIDER !== "deepgram") {
      throw new Error("TTS provider must be deepgram");
    }
    if (!text || !interviewId) return false;

    const token = ++activeToken;
    try {
      console.log("Playing TTS via Deepgram (Thalia)");
      const audioBytes = await fetchAudio(interviewId, text, cacheKey);
      if (!audioBytes || token !== activeToken || audioBytes.byteLength === 0) return false;

      stopCurrentAudio();

      const blob = new Blob([audioBytes], { type: "audio/wav" });
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audio.preload = "auto";
      currentAudio = audio;
      currentObjectUrl = objectUrl;
      audio.onended = () => {
        if (token !== activeToken) return;
        onEnd?.();
      };
      audio.onerror = (event) => {
        if (token !== activeToken) return;
        onError?.(event);
      };

      onStart?.();
      await audio.play();
      return true;
    } catch (error) {
      if (token === activeToken) {
        onError?.(error);
      }
      return false;
    }
  },
};

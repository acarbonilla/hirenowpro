"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, Mic, Video, Square, Play, RotateCcw, CheckCircle, AlertCircle } from "lucide-react";

interface VideoRecorderProps {
    onRecordingComplete: (blob: Blob) => void;
    isProcessing?: boolean;
    maxDuration?: number; // in seconds, default 120
}

export default function VideoRecorder({
    onRecordingComplete,
    isProcessing = false,
    maxDuration = 120
}: VideoRecorderProps) {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
    const [recordedVideo, setRecordedVideo] = useState<string | null>(null);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [audioLevel, setAudioLevel] = useState(0);
    const [permissionError, setPermissionError] = useState("");
    const [deviceWarning, setDeviceWarning] = useState("");
    const [hasAudio, setHasAudio] = useState(false);
    const [recordingFormat, setRecordingFormat] = useState<string>("");
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedVideoId, setSelectedVideoId] = useState("");
    const [selectedAudioId, setSelectedAudioId] = useState("");
    const [showDeviceSelectors, setShowDeviceSelectors] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const getDomExceptionName = (err: unknown) => {
        return err instanceof DOMException ? err.name : "";
    };

    const getMediaErrorMessage = (err: unknown) => {
        const name = getDomExceptionName(err);
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
            return "Camera or microphone not found. Please check your devices and try again.";
        }
        if (name === "NotAllowedError") return "Permission denied.";
        if (name === "OverconstrainedError") return "Selected device unavailable.";
        return "Could not access camera or microphone. Please allow permissions.";
    };

    const stopAudioAnalysis = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        setAudioLevel(0);
        setHasAudio(false);
    };

    const refreshDevices = async (mediaStream: MediaStream) => {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videos = devices.filter(device => device.kind === "videoinput");
        const audios = devices.filter(device => device.kind === "audioinput");
        setVideoDevices(videos);
        setAudioDevices(audios);

        const videoTrack = mediaStream.getVideoTracks()[0];
        const audioTrack = mediaStream.getAudioTracks()[0];
        const currentVideoId = videoTrack?.getSettings?.().deviceId;
        const currentAudioId = audioTrack?.getSettings?.().deviceId;

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
    };

    const startCamera = async (videoDeviceId?: string, audioDeviceId?: string, keepWarning = false) => {
        try {
            setPermissionError("");
            if (!keepWarning) {
                setDeviceWarning("");
            }
            stopCamera();
            stopAudioAnalysis();

            const videoIdValid = videoDeviceId && videoDevices.some(device => device.deviceId === videoDeviceId);
            const audioIdValid = audioDeviceId && audioDevices.some(device => device.deviceId === audioDeviceId);

            if (videoDeviceId && videoDevices.length > 0 && !videoIdValid) {
                setDeviceWarning("Selected camera unavailable. Falling back to default.");
                videoDeviceId = undefined;
            }

            if (audioDeviceId && audioDevices.length > 0 && !audioIdValid) {
                setDeviceWarning("Selected microphone unavailable. Falling back to default.");
                audioDeviceId = undefined;
            }

            const constraints: MediaStreamConstraints = {
                video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
                audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
            };
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: constraints.video,
                audio: constraints.audio
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }

            // Setup audio analysis
            setupAudioAnalysis(mediaStream);
            await refreshDevices(mediaStream);
            const audioTracks = mediaStream.getAudioTracks();
            const videoTracks = mediaStream.getVideoTracks();
            if (audioTracks.length === 0) {
                setPermissionError("No microphone detected. Plug in or enable a microphone, then try again.");
                setShowDeviceSelectors(true);
            } else if (videoTracks.length === 0) {
                setPermissionError("No camera detected. Plug in or enable a camera, then try again.");
                setShowDeviceSelectors(true);
            }

        } catch (err) {
            const name = getDomExceptionName(err);
            if (name === "NotFoundError" && (videoDeviceId || audioDeviceId)) {
                setDeviceWarning("Selected device not found. Falling back to default devices.");
                setShowDeviceSelectors(true);
                await startCamera(undefined, undefined, true);
                return;
            }
            console.error("Error accessing camera:", err);
            setPermissionError(getMediaErrorMessage(err));
            setShowDeviceSelectors(true);
        }
    };

    const setupAudioAnalysis = (mediaStream: MediaStream) => {
        if (!window.AudioContext && !(window as any).webkitAudioContext) return;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(mediaStream);

        microphone.connect(analyser);
        analyser.fftSize = 256;

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const checkAudio = () => {
            if (!analyserRef.current) return;

            analyserRef.current.getByteFrequencyData(dataArray);

            // Calculate average volume
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;

            setAudioLevel(average);

            // Check if we have meaningful audio (threshold > 10)
            if (average > 10) {
                setHasAudio(true);
            }

            animationFrameRef.current = requestAnimationFrame(checkAudio);
        };

        checkAudio();
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    useEffect(() => {
        startCamera();
        return () => {
            stopCamera();
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    const startRecording = () => {
        if (!stream) return;

        // Try to use MP4 format (better Gemini support), fallback to WebM
        let mimeType = 'video/webm;codecs=vp8,opus'; // Default fallback

        if (MediaRecorder.isTypeSupported('video/mp4')) {
            mimeType = 'video/mp4';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264,opus')) {
            mimeType = 'video/webm;codecs=h264,opus'; // H.264 codec is better supported
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
            mimeType = 'video/webm;codecs=vp9,opus'; // VP9 is newer than VP8
        }

        console.log(`📹 Recording with format: ${mimeType}`);
        setRecordingFormat(mimeType);

        const recorder = new MediaRecorder(stream, { mimeType });

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                setRecordedChunks((prev) => [...prev, e.data]);
            }
        };

        recorder.onstop = () => {
            // Extract the base mime type for the blob
            const blobType = mimeType.split(';')[0];
            const blob = new Blob(recordedChunks, { type: blobType });
            const url = URL.createObjectURL(blob);
            setRecordedVideo(url);
            onRecordingComplete(blob);
        };

        setRecordedChunks([]);
        recorder.start();
        setMediaRecorder(recorder);
        setIsRecording(true);
        setRecordingDuration(0);
        setHasAudio(false); // Reset audio check for this recording

        timerRef.current = setInterval(() => {
            setRecordingDuration(prev => {
                if (prev >= maxDuration) {
                    stopRecording();
                    return prev;
                }
                return prev + 1;
            });
        }, 1000);
    };

    const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            setIsRecording(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        }
    };

    const retake = () => {
        setRecordedVideo(null);
        setRecordedChunks([]);
        setRecordingFormat("");
        startCamera(selectedVideoId, selectedAudioId);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (permissionError) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-red-800 mb-2">Camera Access Error</h3>
                <p className="text-red-600">{permissionError}</p>
                <button
                    onClick={() => startCamera()}
                    className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="bg-black rounded-xl overflow-hidden shadow-2xl relative">
            {/* Recording Format Debug Indicator */}
            {recordingFormat && (
                <div className="absolute top-2 left-2 z-10 bg-green-500/90 text-white text-xs px-2 py-1 rounded-md font-mono">
                    {recordingFormat.includes('mp4') ? '✅ MP4' :
                        recordingFormat.includes('h264') ? '✅ H.264' :
                            recordingFormat.includes('vp9') ? '⚠️ VP9' : '❌ VP8'}
                </div>
            )}

            {/* Video Preview/Playback */}
            <div className="relative aspect-video bg-gray-900">
                {!recordedVideo ? (
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover transform scale-x-[-1]" // Mirror effect
                    />
                ) : (
                    <video
                        src={recordedVideo}
                        controls
                        className="w-full h-full object-contain"
                    />
                )}

                {/* Overlays */}
                {isRecording && (
                    <div className="absolute top-4 right-4 flex items-center space-x-2 bg-red-600/80 text-white px-3 py-1 rounded-full backdrop-blur-sm">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        <span className="font-mono font-medium">{formatTime(recordingDuration)}</span>
                    </div>
                )}

                {/* Audio Visualizer (Simple Bar) */}
                {!recordedVideo && (
                    <div className="absolute bottom-4 left-4 right-4">
                        <div className="flex items-center space-x-2 bg-black/50 backdrop-blur-sm p-2 rounded-lg">
                            <Mic className={`w-4 h-4 ${audioLevel > 5 ? 'text-green-400' : 'text-gray-400'}`} />
                            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-75 ${audioLevel > 80 ? 'bg-red-500' :
                                        audioLevel > 40 ? 'bg-yellow-500' :
                                            'bg-green-500'
                                        }`}
                                    style={{ width: `${Math.min(100, (audioLevel / 255) * 200)}%` }}
                                />
                            </div>
                            {hasAudio && <CheckCircle className="w-4 h-4 text-green-400" />}
                        </div>
                        {!hasAudio && isRecording && recordingDuration > 2 && (
                            <p className="text-xs text-yellow-400 mt-1 ml-1">
                                ⚠️ No audio detected. Check your microphone.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="bg-gray-900 p-4 border-t border-gray-800">
                {deviceWarning && (
                    <p className="text-xs text-yellow-400 mb-3">{deviceWarning}</p>
                )}
                {(videoDevices.length > 1 || audioDevices.length > 1) && showDeviceSelectors && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Camera</label>
                            <select
                                value={selectedVideoId}
                                onChange={(e) => {
                                    const nextId = e.target.value;
                                    setSelectedVideoId(nextId);
                                    startCamera(nextId, selectedAudioId);
                                }}
                                className="w-full bg-gray-800 text-white text-sm px-2 py-1 rounded"
                            >
                                {videoDevices.map(device => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {device.label || "Camera"}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Microphone</label>
                            <select
                                value={selectedAudioId}
                                onChange={(e) => {
                                    const nextId = e.target.value;
                                    setSelectedAudioId(nextId);
                                    startCamera(selectedVideoId, nextId);
                                }}
                                className="w-full bg-gray-800 text-white text-sm px-2 py-1 rounded"
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
                        className="text-xs text-blue-300 hover:text-blue-200"
                    >
                        Having trouble?
                    </button>
                )}
                <div className="flex items-center justify-center space-x-6">
                    {!recordedVideo ? (
                        !isRecording ? (
                            <button
                                onClick={startRecording}
                                className="group flex flex-col items-center space-y-1"
                            >
                                <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center group-hover:bg-red-500 transition-all shadow-lg group-hover:scale-105">
                                    <div className="w-6 h-6 bg-white rounded-sm" />
                                </div>
                                <span className="text-xs text-gray-400 font-medium">Record</span>
                            </button>
                        ) : (
                            <button
                                onClick={stopRecording}
                                className="group flex flex-col items-center space-y-1"
                            >
                                <div className="w-16 h-16 rounded-full bg-gray-800 border-2 border-red-500 flex items-center justify-center group-hover:bg-gray-700 transition-all">
                                    <Square className="w-6 h-6 text-red-500 fill-current" />
                                </div>
                                <span className="text-xs text-gray-400 font-medium">Stop</span>
                            </button>
                        )
                    ) : (
                        <div className="flex items-center space-x-4">
                            <button
                                onClick={retake}
                                disabled={isProcessing}
                                className="flex items-center px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                            >
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Retake
                            </button>
                            {/* Confirmation is handled by parent via onRecordingComplete */}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

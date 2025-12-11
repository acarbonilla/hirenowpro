"""
Deepgram Speech-to-Text Service for Interview Video Transcription

This service handles:
1. Audio extraction from video files
2. Transcription using Deepgram API
3. Token/cost tracking
"""

import os
import time
import tempfile
from typing import Dict, Any
from django.conf import settings
from deepgram import DeepgramClient, PrerecordedOptions, FileSource


class DeepgramTranscriptionService:
    """Service class for Deepgram-powered video transcription"""
    
    def __init__(self):
        """Initialize Deepgram client"""
        api_key = settings.DEEPGRAM_API_KEY
        if not api_key:
            raise ValueError("DEEPGRAM_API_KEY not configured in settings")
        
        self.client = DeepgramClient(api_key)
        print("✓ Deepgram client initialized")
    
    def transcribe_video(self, video_file_path: str, video_response_id: int = None) -> Dict[str, Any]:
        """
        Extract audio from video and transcribe using Deepgram
        
        Args:
            video_file_path: Path to video file
            video_response_id: Optional ID for logging
            
        Returns:
            Dict with:
                - transcript: The transcribed text
                - duration: Audio duration in seconds
                - confidence: Average confidence score (0-1)
                - word_count: Number of words detected
                - processing_time: Time taken to process
        """
        start_time = time.time()
        audio_path = None
        
        try:
            print(f"\n🎤 Starting Deepgram transcription for video {video_response_id}...")
            
            # Step 1: Extract audio from video
            audio_path = self._extract_audio(video_file_path)
            
            # Step 2: Transcribe audio with Deepgram
            result = self._transcribe_audio(audio_path)
            
            processing_time = time.time() - start_time
            
            # Extract transcript and metadata
            transcript_data = self._parse_deepgram_response(result, processing_time)
            
            print(f"✅ Deepgram transcription complete in {processing_time:.2f}s")
            print(f"   Transcript: {len(transcript_data['transcript'])} chars, "
                  f"{transcript_data['word_count']} words, "
                  f"{transcript_data['confidence']:.2%} confidence")
            
            # Log usage for monitoring
            self._log_usage(
                video_response_id=video_response_id,
                transcript=transcript_data['transcript'],
                duration=transcript_data['duration'],
                processing_time=processing_time
            )
            
            return transcript_data
            
        except Exception as e:
            processing_time = time.time() - start_time
            print(f"❌ Deepgram transcription failed: {e}")
            
            # Log failed attempt
            self._log_usage(
                video_response_id=video_response_id,
                transcript="",
                duration=0,
                processing_time=processing_time,
                success=False,
                error=str(e)
            )
            
            raise Exception(f"Transcription failed: {str(e)}")
            
        finally:
            # Clean up temp audio file
            if audio_path and os.path.exists(audio_path):
                try:
                    os.unlink(audio_path)
                    print(f"🗑️ Cleaned up temp audio file")
                except Exception as cleanup_error:
                    print(f"⚠️ Failed to clean up temp file: {cleanup_error}")
    
    def _extract_audio(self, video_file_path: str) -> str:
        """
        Extract audio from video file using ffmpeg
        
        Returns path to temporary audio file
        """
        import ffmpeg
        
        print(f"🎵 Extracting audio from video...")
        
        # Create temp file for audio
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as temp_audio:
            audio_path = temp_audio.name
        
        try:
            # Extract audio using ffmpeg (mp3 format, 44.1kHz, stereo)
            stream = ffmpeg.input(video_file_path)
            stream = ffmpeg.output(stream, audio_path, 
                                 acodec='libmp3lame', 
                                 ar='44100',  # Sample rate
                                 ac=2,        # Stereo
                                 ab='128k')   # Bitrate
            ffmpeg.run(stream, capture_stdout=True, capture_stderr=True, overwrite_output=True)
            
            print(f"✓ Audio extracted: {audio_path}")
            return audio_path
            
        except ffmpeg.Error as e:
            stderr = e.stderr.decode() if e.stderr else 'Unknown error'
            raise Exception(f"Failed to extract audio: {stderr}")
    
    def _transcribe_audio(self, audio_path: str) -> Any:
        """
        Transcribe audio file using Deepgram API
        
        Returns Deepgram response object
        """
        print(f"🎯 Transcribing audio with Deepgram...")
        
        # Read audio file
        with open(audio_path, 'rb') as audio_file:
            audio_bytes = audio_file.read()

        # Configure Deepgram options (use simple kwargs to avoid typing.Union instantiation issues)
        options = PrerecordedOptions(
            model="nova-2",              # Latest model
            smart_format=True,           # Automatic punctuation and formatting
            language="en",               # English
            diarize=False,               # Single speaker (applicant)
            punctuate=True,              # Add punctuation
        )

        # Create file source as a plain dict per SDK examples
        source: FileSource = {"buffer": audio_bytes, "mimetype": "audio/mp3"}

        # Transcribe
        response = self.client.listen.rest.v("1").transcribe_file(
            source=source,
            options=options,
        )
        
        return response
    
    def _parse_deepgram_response(self, response: Any, processing_time: float) -> Dict[str, Any]:
        """
        Parse Deepgram response and extract relevant data
        
        Returns structured transcript data
        """
        # Get the transcript
        transcript = ""
        confidence = 0.0
        word_count = 0
        duration = 0.0
        
        try:
            # Access the first result and first alternative
            result = response.results.channels[0].alternatives[0]
            transcript = result.transcript.strip()
            confidence = result.confidence
            word_count = len(result.words) if hasattr(result, 'words') else len(transcript.split())
            
            # Get duration from metadata
            metadata = response.metadata
            duration = metadata.duration if hasattr(metadata, 'duration') else 0.0
            
        except (AttributeError, IndexError) as e:
            print(f"⚠️ Error parsing Deepgram response: {e}")
            # Use defaults
            pass
        
        return {
            'transcript': transcript,
            'duration': duration,
            'confidence': confidence,
            'word_count': word_count,
            'processing_time': processing_time
        }
    
    def _log_usage(self, video_response_id: int = None, transcript: str = "", 
                   duration: float = 0, processing_time: float = 0,
                   success: bool = True, error: str = ""):
        """
        Log Deepgram usage for monitoring and cost tracking
        
        Note: Deepgram charges by audio duration, not tokens
        """
        try:
            from monitoring.models import TokenUsage
            
            # Estimate pseudo-token count based on words
            word_count = len(transcript.split()) if transcript else 0

            # Log to monitoring system using existing TokenUsage fields
            TokenUsage.objects.create(
                operation_type='transcription',  # reuse existing type bucket
                video_response_id=video_response_id,
                input_tokens=0,
                output_tokens=word_count,
                api_response_time=processing_time,
                model_name='deepgram-nova-2',
                prompt_length=len(f"Audio duration: {duration:.2f}s"),
                response_length=len(transcript),
                success=success,
                error_message=error or "",
            )
            
            print(f"📊 Logged Deepgram usage: {duration:.2f}s audio, words={word_count}")
            
        except Exception as log_error:
            print(f"⚠️ Failed to log Deepgram usage: {log_error}")


# Singleton instance
_deepgram_service = None

def get_deepgram_service() -> DeepgramTranscriptionService:
    """Get or create singleton Deepgram service instance"""
    global _deepgram_service
    if _deepgram_service is None:
        _deepgram_service = DeepgramTranscriptionService()
    return _deepgram_service

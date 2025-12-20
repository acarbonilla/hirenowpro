"""
AI Service for Interview Video Analysis
Uses Google Gemini 2.5 Flash for transcript analysis
"""

import os
import json
from typing import Dict, Any
import google.generativeai as genai
from django.conf import settings


class AIAnalysisService:
    """Service class for AI-powered video interview analysis"""
    
    def __init__(self):
        """Initialize Gemini client"""
        api_key = os.getenv('GEMINI_API_KEY') or settings.GEMINI_API_KEY
        if not api_key:
            raise ValueError("Gemini API key not found. Set GEMINI_API_KEY in environment or settings.")
        
        genai.configure(api_key=api_key)
        # Using stable Gemini 2.5 Flash model
        self.model = genai.GenerativeModel('gemini-2.5-flash')
    
    def _log_token_usage(self, operation_type, prompt, response_text, response_time, 
                        interview_id=None, video_response_id=None, response_obj=None, 
                        success=True, error=""):
        """Log token usage to monitoring system"""
        try:
            from monitoring.models import TokenUsage
            
            # Estimate tokens (rough approximation: 1 token ≈ 4 characters)
            input_tokens = len(prompt) // 4
            output_tokens = len(response_text) // 4
            
            # Try to get actual token count from response metadata if available
            if response_obj and hasattr(response_obj, 'usage_metadata'):
                try:
                    usage = response_obj.usage_metadata
                    input_tokens = getattr(usage, 'prompt_token_count', input_tokens)
                    output_tokens = getattr(usage, 'candidates_token_count', output_tokens)
                except:
                    pass
            
            TokenUsage.objects.create(
                operation_type=operation_type,
                interview_id=interview_id,
                video_response_id=video_response_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model_name='gemini-2.5-flash',
                api_response_time=response_time,
                prompt_length=len(prompt),
                response_length=len(response_text),
                success=success,
                error_message=error
            )
        except Exception as e:
            # Don't fail the operation if logging fails
            print(f"Warning: Failed to log token usage: {e}")
    
    def analyze_transcript(self, transcript_text: str, question_text: str, question_type: str) -> Dict[str, Any]:
        """
        Analyze interview transcript using OpenAI GPT-4
        
        Args:
            transcript_text: The transcribed text from video
            question_text: The interview question that was asked
            question_type: Type of question (technical, behavioral, situational, general)
        
        Returns:
            Dictionary containing analysis scores and recommendation
        """
        
        # Check for empty or no-audio transcripts
        no_audio_indicators = [
            "[no audible speech]",
            "no spoken content",
            "there is no audio",
            "no audio detected",
            "silence",
        ]
        
        transcript_lower = transcript_text.lower().strip()
        is_empty = len(transcript_lower) == 0
        is_no_audio = any(indicator in transcript_lower for indicator in no_audio_indicators)
        is_too_short = len(transcript_lower) < 10  # Less than 10 characters
        
        # If no meaningful audio detected, flag as technical issue
        if is_empty or is_no_audio or is_too_short:
            return {
                'sentiment_score': None,  # Use None instead of 0 to indicate "not applicable"
                'confidence_score': None,
                'speech_clarity_score': None,
                'content_relevance_score': None,
                'overall_score': None,
                'recommendation': 'technical_issue',  # Special flag for technical problems
                'analysis_summary': 'No audible speech detected in video. This may be due to microphone issues, no response from applicant, or technical recording problems. Manual review required.',
                'technical_issue': True,
                'issue_type': 'no_audio'
            }
        
        prompt = f"""
You are an AI assistant acting as a JUNIOR HR ANALYST.
You provide structured, conservative, evidence-based evaluations.
You DO NOT make hiring decisions. Final decisions are made by human HR.

IMPORTANT RULES:
- Base ALL judgments strictly on the transcript content.
- Do NOT assume intent, skill, or experience unless explicitly stated.
- Penalize vague, rambling, or off-topic answers.
- If the response lacks clarity or depth, score accordingly.
- Be consistent and conservative in scoring.

Interview Context:
- Question: {question_text}
- Question Type: {question_type}

Candidate Response (verbatim transcript):
\"\"\"
{transcript_text}
\"\"\"

EVALUATION CRITERIA (score each from 0 to 100):

1. SENTIMENT_SCORE
Evaluate emotional tone and professionalism.
- High score ONLY if tone is calm, respectful, and appropriate.
- Neutral tone is acceptable.
- Penalize frustration, sarcasm, or disengagement.

2. CONFIDENCE_SCORE
Evaluate confidence based on:
- Clear statements
- Logical flow
- Lack of excessive hesitation or filler
Do NOT reward overconfidence or verbosity.

3. SPEECH_CLARITY_SCORE
Evaluate:
- Grammar
- Sentence structure
- Ease of understanding
Accent is NOT a penalty.

4. CONTENT_RELEVANCE_SCORE
Evaluate how directly the answer addresses the question.
This is the MOST IMPORTANT score.
- Strong penalty if the answer avoids the question.
- Strong reward for concrete examples and structured thinking.

5. OVERALL_SCORE
Calculate the average of the above scores.
Round to the nearest whole number.

6. RECOMMENDATION
This is a SUGGESTION ONLY:
- "pass" -> overall_score >= 70 AND content_relevance_score >= 65
- "review" -> overall_score between 50-69
- "fail" -> overall_score < 50 OR content_relevance_score < 40

7. ANALYSIS_SUMMARY
Write 2-3 short sentences explaining:
- What the candidate did well
- What was missing or weak
Avoid judgmental language.

OUTPUT FORMAT:
Return ONLY valid JSON.
Do NOT include markdown.
Do NOT include explanations outside JSON.

{{
  "sentiment_score": <number>,
  "confidence_score": <number>,
  "speech_clarity_score": <number>,
  "content_relevance_score": <number>,
  "overall_score": <number>,
  "recommendation": "<pass|review|fail>",
  "analysis_summary": "<concise explanation>"
}}
"""
        import time
        start_time = time.time()
        
        try:
            # Generate content with Gemini
            response = self.model.generate_content(
                prompt,
                generation_config={
                    'temperature': 0.3,  # Lower temperature for more consistent scoring
                    'response_mime_type': 'application/json'
                }
            )
            
            # Parse the JSON response
            analysis = json.loads(response.text)
            
            # Validate required fields
            required_fields = ['sentiment_score', 'confidence_score', 'speech_clarity_score', 
                             'content_relevance_score', 'overall_score', 'recommendation']
            for field in required_fields:
                if field not in analysis:
                    raise ValueError(f"Missing required field: {field}")

            # Clamp numeric scores to integers in [0, 100]
            score_fields = [
                'sentiment_score',
                'confidence_score',
                'speech_clarity_score',
                'content_relevance_score',
                'overall_score',
            ]
            for field in score_fields:
                raw_value = analysis.get(field)
                try:
                    normalized = int(round(float(raw_value)))
                except (TypeError, ValueError):
                    normalized = 0
                analysis[field] = max(0, min(100, normalized))
            
            # Log token usage
            response_time = time.time() - start_time
            self._log_token_usage(
                operation_type='analysis',
                prompt=prompt,
                response_text=response.text,
                response_time=response_time,
                success=True,
                response_obj=response
            )
            
            return analysis
            
        except Exception as e:
            # Log failed analysis
            response_time = time.time() - start_time
            self._log_token_usage(
                operation_type='analysis',
                prompt=prompt,
                response_text="",
                response_time=response_time,
                success=False,
                error=str(e)
            )
            
            # Return default low scores if analysis fails
            return {
                'sentiment_score': 50.0,
                'confidence_score': 50.0,
                'speech_clarity_score': 50.0,
                'content_relevance_score': 50.0,
                'overall_score': 50.0,
                'recommendation': 'review',
                'analysis_summary': f'Analysis failed: {str(e)}',
                'error': str(e)
            }
    
    def transcribe_video(self, video_file_path: str, video_response_id: int = None) -> str:
        """
        Transcribe audio from video using Gemini's multimodal capabilities
        WITH FALLBACK: If video processing fails, extract audio and try again
        
        Args:
            video_file_path: Path to the video file
            video_response_id: Optional ID to link token usage
        
        Returns:
            Transcribed text
        """
        import time
        start_time = time.time()
        
        # Try direct video upload first
        try:
            return self._transcribe_video_direct(video_file_path, video_response_id, start_time)
        except Exception as video_error:
            print(f"⚠️ Direct video transcription failed: {video_error}")
            print(f"🔄 Attempting audio extraction fallback...")
            
            # Fallback: Extract audio and transcribe
            try:
                return self._transcribe_audio_extracted(video_file_path, video_response_id, start_time)
            except Exception as audio_error:
                print(f"❌ Audio extraction also failed: {audio_error}")
                # Final fallback: return a message indicating no audio
                response_time = time.time() - start_time
                self._log_token_usage(
                    operation_type='transcription',
                    prompt="Video transcription (all methods failed)",
                    response_text="",
                    response_time=response_time,
                    video_response_id=video_response_id,
                    success=False,
                    error=f"Video: {str(video_error)}, Audio: {str(audio_error)}"
                )
                raise Exception(f"Transcription failed: {str(video_error)}")
    
    def _transcribe_video_direct(self, video_file_path: str, video_response_id: int, start_time: float) -> str:
        """Direct video upload to Gemini (original method)"""
        import time
        
        # Upload video file to Gemini
        print(f"📤 Uploading video to Gemini...")
        video_file = genai.upload_file(path=video_file_path)
        print(f"✓ Video uploaded: {video_file.name}")
        
        # Wait for processing with optimized polling
        max_wait_time = 30  # Maximum 30 seconds wait
        poll_interval = 0.5  # Check every 0.5 seconds
        elapsed = 0
        
        print(f"⏳ Waiting for Gemini to process video...")
        while video_file.state.name == "PROCESSING" and elapsed < max_wait_time:
            time.sleep(poll_interval)
            elapsed += poll_interval
            video_file = genai.get_file(video_file.name)
            if elapsed % 2 == 0:  # Log every 2 seconds
                print(f"  ... still processing ({elapsed}s)")
        
        print(f"📊 Final state: {video_file.state.name}")
        
        if video_file.state.name == "FAILED":
            genai.delete_file(video_file.name)
            raise Exception("Gemini rejected video file (possibly unsupported format)")
        
        if video_file.state.name == "PROCESSING":
            genai.delete_file(video_file.name)
            raise Exception("Video processing timeout")
        
        # Generate transcription
        print(f"🎯 Generating transcription...")
        prompt = "Transcribe the spoken content from this video. Return only the transcribed text."
        
        response = self.model.generate_content(
            [prompt, video_file],
            generation_config={'temperature': 0.1}
        )
        
        # Clean up
        genai.delete_file(video_file.name)
        
        transcript = response.text.strip()
        
        # Log success
        response_time = time.time() - start_time
        self._log_token_usage(
            operation_type='transcription',
            prompt=prompt,
            response_text=transcript,
            response_time=response_time,
            video_response_id=video_response_id,
            success=True,
            response_obj=response
        )
        
        return transcript
    
    def _transcribe_audio_extracted(self, video_file_path: str, video_response_id: int, start_time: float) -> str:
        """Extract audio from video and transcribe (fallback method)"""
        import time
        import os
        import tempfile
        
        # Try moviepy first
        audio_path = None
        try:
            print(f"🎵 Attempting audio extraction with moviepy...")
            from moviepy.editor import VideoFileClip
            
            # Extract audio to temporary file
            with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as temp_audio:
                audio_path = temp_audio.name
            
            video = VideoFileClip(video_file_path)
            video.audio.write_audiofile(audio_path, logger=None, verbose=False)
            video.close()
            
            print(f"✓ Audio extracted with moviepy: {audio_path}")
            
        except ImportError:
            print(f"⚠️ moviepy not available, trying ffmpeg-python...")
            try:
                import ffmpeg
                
                with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as temp_audio:
                    audio_path = temp_audio.name
                
                # Extract audio using ffmpeg
                stream = ffmpeg.input(video_file_path)
                stream = ffmpeg.output(stream, audio_path, acodec='libmp3lame', ar='44100', ac=2)
                ffmpeg.run(stream, capture_stdout=True, capture_stderr=True, overwrite_output=True)
                
                print(f"✓ Audio extracted with ffmpeg: {audio_path}")
                
            except ImportError:
                raise Exception(
                    "No audio extraction tool available. Install either:\n"
                    "  pip install moviepy\n"
                    "OR\n"
                    "  pip install ffmpeg-python"
                )
            except Exception as ffmpeg_error:
                raise Exception(f"ffmpeg extraction failed: {str(ffmpeg_error)}")
        
        except Exception as moviepy_error:
            raise Exception(f"moviepy extraction failed: {str(moviepy_error)}")
        
        # Now transcribe the extracted audio
        try:
            print(f"📤 Uploading audio to Gemini...")
            
            # Upload audio file
            audio_file = genai.upload_file(path=audio_path)
            
            # Wait for processing
            max_wait_time = 30
            poll_interval = 0.5
            elapsed = 0
            
            while audio_file.state.name == "PROCESSING" and elapsed < max_wait_time:
                time.sleep(poll_interval)
                elapsed += poll_interval
                audio_file = genai.get_file(audio_file.name)
            
            if audio_file.state.name == "FAILED":
                genai.delete_file(audio_file.name)
                raise Exception("Audio processing failed")
            
            if audio_file.state.name == "PROCESSING":
                genai.delete_file(audio_file.name)
                raise Exception("Audio processing timeout")
            
            # Transcribe
            print(f"🎯 Transcribing audio...")
            prompt = "Transcribe the spoken content from this audio. Return only the transcribed text."
            
            response = self.model.generate_content(
                [prompt, audio_file],
                generation_config={'temperature': 0.1}
            )
            
            # Clean up
            genai.delete_file(audio_file.name)
            
            transcript = response.text.strip()
            
            # Log success
            response_time = time.time() - start_time
            self._log_token_usage(
                operation_type='transcription',
                prompt=prompt + " (audio extracted)",
                response_text=transcript,
                response_time=response_time,
                video_response_id=video_response_id,
                success=True,
                response_obj=response
            )
            
            print(f"✓ Audio transcription successful!")
            return transcript
            
        finally:
            # Clean up temp audio file
            if audio_path and os.path.exists(audio_path):
                try:
                    os.unlink(audio_path)
                    print(f"🗑️ Cleaned up temp audio file")
                except:
                    pass
    
    def batch_analyze_transcripts(self, transcripts_data: list, interview_id: int = None) -> list:
        """
        Analyze multiple transcripts in a SINGLE API call for maximum speed
        OPTIMIZED: 5x faster than individual calls
        
        Args:
            transcripts_data: List of dicts with:
                - transcript_text: The transcribed text
                - question_text: The interview question
                - question_type: Type of question
            interview_id: Optional ID to link token usage
        
        Returns:
            List of analysis results in same order
        """
        import time
        import json
        
        # Build batch prompt with all questions
        batch_prompt = """You are an expert HR interviewer analyzing multiple video interview responses.
Analyze ALL responses and return a JSON array with results for each in order.

For each response, provide scores (0-100) for:
- sentiment_score: Emotional tone and enthusiasm
- confidence_score: Self-assurance and certainty
- speech_clarity_score: Articulation and grammar
- content_relevance_score: How well the answer addresses the question
- overall_score: Average of above scores
- recommendation: "pass" (≥70), "review" (50-69), or "fail" (<50)
- analysis_summary: Brief 2-3 sentence explanation

"""
        
        # Add each Q&A to the prompt
        for i, data in enumerate(transcripts_data, 1):
            batch_prompt += f"""
=== RESPONSE {i} ===
Question: {data['question_text']}
Type: {data['question_type']}
Answer: {data['transcript']}

"""
        
        batch_prompt += """
Return ONLY a JSON array with {len(transcripts_data)} objects, one for each response in order:
[
  {
    "sentiment_score": <number>,
    "confidence_score": <number>,
    "speech_clarity_score": <number>,
    "content_relevance_score": <number>,
    "overall_score": <number>,
    "recommendation": "<pass|review|fail>",
    "analysis_summary": "<explanation>"
  },
  ... (repeat for all responses)
]
"""
        
        start_time = time.time()
        
        try:
            print(f"📊 Batch analyzing {len(transcripts_data)} transcripts in single API call...")
            
            response = self.model.generate_content(
                batch_prompt,
                generation_config={
                    'temperature': 0.3,
                    'response_mime_type': 'application/json'
                }
            )
            
            response_time = time.time() - start_time
            print(f"✅ Batch analysis completed in {response_time:.2f}s")
            
            # Parse JSON array
            analyses = json.loads(response.text)
            
            # Log token usage
            self._log_token_usage(
                operation_type='analysis',
                prompt=batch_prompt,
                response_text=response.text,
                response_time=response_time,
                interview_id=interview_id,
                success=True,
                response_obj=response
            )
            
            # Ensure we got the right number of results
            if len(analyses) != len(transcripts_data):
                print(f"⚠️ Expected {len(transcripts_data)} results, got {len(analyses)}")
                # Fall back to individual analysis if batch fails
                return [self.analyze_transcript(
                    d['transcript_text'], 
                    d['question_text'], 
                    d['question_type']
                ) for d in transcripts_data]
            
            return analyses
            
        except Exception as e:
            # Log failed batch analysis
            response_time = time.time() - start_time
            self._log_token_usage(
                operation_type='analysis',
                prompt=batch_prompt,
                response_text="",
                response_time=response_time,
                interview_id=interview_id,
                success=False,
                error=str(e)
            )
            
            print(f"❌ Batch analysis failed: {e}. Falling back to individual analysis...")
            # Fallback: analyze individually
            return [self.analyze_transcript(
                d['transcript_text'], 
                d['question_text'], 
                d['question_type']
            ) for d in transcripts_data]
    
    def batch_transcribe_and_analyze(self, video_responses_data: list, interview_id: int = None) -> list:
        """
        Process multiple videos with OPTIMIZED parallel transcription + batch analysis
        ULTRA-FAST: Transcribe in parallel, then analyze all in ONE API call
        
        Args:
            video_responses_data: List of dicts with keys:
                - video_id: ID of the video response
                - video_file_path: Path to video file
                - question_text: The interview question
                - question_type: Type of question
            interview_id: Optional ID to link token usage
        
        Returns:
            List of dicts with transcripts and analysis results
        """
        import concurrent.futures
        import time
        
        start_time = time.time()
        
        print(f"\n⚡ Starting ULTRA-FAST processing of {len(video_responses_data)} videos...")
        
        # PHASE 1: Parallel Transcription
        print(f"📹 Phase 1: Transcribing {len(video_responses_data)} videos in parallel...")
        transcribe_start = time.time()
        
        def transcribe_single(data):
            """Transcribe one video"""
            try:
                video_id = data.get('video_id', 'unknown')
                transcript = self.transcribe_video(
                    data['video_file_path'],
                    video_response_id=video_id
                )
                print(f"  ✓ Transcribed video {video_id}")
                return {
                    'video_id': video_id,
                    'transcript': transcript,
                    'question_text': data['question_text'],
                    'question_type': data['question_type'],
                    'success': True
                }
            except Exception as e:
                print(f"  ❌ Transcription failed for video {video_id}: {e}")
                return {
                    'video_id': video_id,
                    'transcript': '',
                    'question_text': data['question_text'],
                    'question_type': data['question_type'],
                    'success': False,
                    'error': str(e)
                }
        
        # Transcribe all videos in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            transcribe_results = list(executor.map(transcribe_single, video_responses_data))
        
        transcribe_elapsed = time.time() - transcribe_start
        print(f"✅ Phase 1 complete in {transcribe_elapsed:.2f}s")
        
        # PHASE 2: Batch Analysis (single API call for all)
        print(f"📊 Phase 2: Analyzing all {len(video_responses_data)} transcripts in ONE API call...")
        analyze_start = time.time()
        analyze_elapsed = 0  # Ensure variable is always defined
        
        # Prepare data for batch analysis
        successful_transcripts = [r for r in transcribe_results if r['success']]
        
        if successful_transcripts:
            # Analyze ALL transcripts in a single API call
            analyses = self.batch_analyze_transcripts(successful_transcripts, interview_id=interview_id)
            analyze_elapsed = time.time() - analyze_start
            print(f"✅ Phase 2 complete in {analyze_elapsed:.2f}s")
            
            # Combine results
            results = []
            for transcript_result, analysis in zip(transcribe_results, analyses):
                if transcript_result['success']:
                    results.append({
                        'video_id': transcript_result['video_id'],
                        'transcript': transcript_result['transcript'],
                        'analysis': analysis,
                        'success': True
                    })
                else:
                    results.append({
                        'video_id': transcript_result['video_id'],
                        'transcript': '',
                        'analysis': {
                            'sentiment_score': 50.0,
                            'confidence_score': 50.0,
                            'speech_clarity_score': 50.0,
                            'content_relevance_score': 50.0,
                            'overall_score': 50.0,
                            'recommendation': 'review',
                            'analysis_summary': f'Processing failed: {transcript_result.get("error", "Unknown error")}'
                        },
                        'success': False,
                        'error': transcript_result.get('error', 'Transcription failed')
                    })
        else:
            results = transcribe_results
        
        elapsed = time.time() - start_time
        print(f"\n🚀 ULTRA-FAST processing complete!")
        print(f"⏱️  Total time: {elapsed:.2f}s")
        print(f"📊 Breakdown: Transcribe {transcribe_elapsed:.2f}s + Analyze {analyze_elapsed:.2f}s")
        print(f"⚡ Average per video: {elapsed/len(results):.2f}s")
        
        return results


    def generate_coaching_feedback(self, transcript: str, question_text: str) -> Dict[str, Any]:
        """
        Analyze transcript for coaching feedback.
        Returns a dict with strengths, improvements, coaching_tips, etc.
        """
        import time
        start_time = time.time()
        
        prompt = f"""
        Act as a friendly and encouraging interview coach.
        Analyze the following interview response to the question: "{question_text}"
        
        Transcript:
        "{transcript}"
        
        Provide constructive feedback in JSON format with the following structure:
        {{
            "strengths": ["point 1", "point 2"],
            "improvements": ["point 1", "point 2"],
            "coaching_tips": ["specific tip 1", "specific tip 2"],
            "example_phrasing": "Better way to say a key part...",
            "scores": {{
                "clarity": 0-100,
                "confidence": 0-100,
                "relevance": 0-100
            }}
        }}
        
        Keep the tone positive and helpful. Focus on actionable advice.
        """
        
        try:
            response = self.model.generate_content(
                prompt,
                generation_config={'temperature': 0.7, 'response_mime_type': 'application/json'}
            )
            
            result_text = response.text.strip()
            # Clean up markdown code blocks if present
            if result_text.startswith("```json"):
                result_text = result_text[7:]
            if result_text.endswith("```"):
                result_text = result_text[:-3]
                
            feedback = json.loads(result_text)
            
            # Log usage
            self._log_token_usage(
                operation_type='coaching',
                prompt=prompt,
                response_text=result_text,
                response_time=time.time() - start_time,
                success=True
            )
            
            return feedback
            
        except Exception as e:
            print(f"Coaching generation failed: {e}")
            self._log_token_usage(
                operation_type='coaching',
                prompt=prompt,
                response_text="",
                response_time=time.time() - start_time,
                success=False,
                error=str(e)
            )
            return {
                "strengths": ["Could not analyze"],
                "improvements": ["Please try again"],
                "coaching_tips": ["AI service temporarily unavailable"],
                "example_phrasing": "",
                "scores": {"clarity": 0, "confidence": 0, "relevance": 0}
            }


# Singleton instance
_ai_service = None

def get_ai_service() -> AIAnalysisService:
    """Get or create singleton AI service instance"""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIAnalysisService()
    return _ai_service

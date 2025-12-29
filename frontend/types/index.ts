// Type definitions for HireNowPro

export interface Applicant {
  id: number;
  first_name: string;
  last_name: string;
  full_name?: string;
  email: string;
  phone: string;
  application_source: "walk_in" | "online";
  status:
  | "pending"
  | "in_review"
  | "passed"
  | "failed"
  | "hired"
  | "failed_training"
  | "failed_onboarding"
  | "withdrawn";
  application_date: string;
  reapplication_date?: string | null;
  position_applied?: string;
  latitude?: number;
  longitude?: number;
  distance_from_office?: number;
  geo_status?: "onsite" | "offsite" | "unknown";
  is_onsite?: boolean;
  location_source?: string;
  created_at: string;
  updated_at: string;
}

export interface InterviewQuestion {
  id: number;
  question_text: string;
  question_type: "technical" | "behavioral" | "situational" | "general";
  order: number;
  competency:
    | "communication"
    | "customer_handling"
    | "problem_explanation"
    | "troubleshooting"
    | "technical_reasoning"
    | "networking_concepts"
    | "sales_upselling";
}

export interface VideoResponse {
  id: number;
  question: InterviewQuestion;
  question_id: number;
  video_file_path: string;
  duration: string;
  uploaded_at: string;
  processed: boolean;
  ai_analysis?: AIAnalysis;
}

export interface AIAnalysis {
  id: number;
  transcript_text: string;
  sentiment_score: number;
  confidence_score: number;
  body_language_analysis: any;
  speech_clarity_score: number;
  content_relevance_score: number;
  overall_score: number;
  recommendation: "pass" | "fail" | "review";
  analyzed_at: string;
}

export interface Interview {
  id: number;
  applicant: Applicant;
  interview_type: "initial_ai" | "technical" | "final";
  status: "pending" | "in_progress" | "submitted" | "processing" | "completed" | "failed";
  attempt_number?: number;
  current_question_index?: number;
  archived?: boolean;
  is_retake?: boolean;
  expires_at?: string | null;
  created_at: string;
  completed_at?: string | null;
  position_type?: string | null;
  questions?: InterviewQuestion[];
  video_responses?: VideoResponse[];
  answered_question_ids?: number[];
}

export interface InterviewAnalysis {
  total_questions: number;
  answered_questions: number;
  overall_score: number;
  recommendation: string;
  video_responses: {
    question: string;
    sentiment_score: number;
    confidence_score: number;
    overall_score: number;
  }[];
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
}

export interface ApiResponse<T> {
  message?: string;
  data?: T;
  [key: string]: any;
}

// Training Module Types
export interface TrainingModule {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  order: number;
}

export interface TrainingSession {
  id: number;
  applicant: number; // ID
  module: TrainingModule | null;
  status: 'in_progress' | 'completed' | 'abandoned';
  created_at: string;
  completed_at?: string | null;
}

export interface TrainingResponse {
  id: number;
  session: number;
  question_text: string;
  video_file: string;
  transcript: string;
  ai_feedback: {
    error?: string;
    error_type?: string;
    strengths: string[];
    improvements: string[];
    coaching_tips: string[];
    example_phrasing?: string;
    scores?: {
      clarity: number;
      confidence: number;
      relevance: number;
    };
  };
  scores: Record<string, number>;
  created_at: string;
}

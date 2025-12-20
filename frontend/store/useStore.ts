import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Applicant, Interview, InterviewQuestion } from "@/types";

interface AppState {
  // Applicant state
  currentApplicant: Applicant | null;
  setCurrentApplicant: (applicant: Applicant | null) => void;

  // Interview state
  currentInterview: Interview | null;
  setCurrentInterview: (interview: Interview | null) => void;

  // Questions state
  questions: InterviewQuestion[];
  setQuestions: (questions: InterviewQuestion[]) => void;

  // Current question index
  currentQuestionIndex: number;
  setCurrentQuestionIndex: (index: number) => void;
  nextQuestion: () => void;
  previousQuestion: () => void;

  // Video recording state
  recordedVideos: Record<number, Blob>; // questionId -> videoBlob
  addRecordedVideo: (questionId: number, blob: Blob) => void;
  removeRecordedVideo: (questionId: number) => void;
  clearRecordedVideos: () => void;
  answeredQuestions: Set<number>;
  setAnsweredQuestions: (questionIds: number[]) => void;
  markQuestionAnswered: (questionId: number) => void;
  clearAnsweredQuestions: () => void;

  // Loading state
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;

  // Reset all state
  reset: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentApplicant: null,
      currentInterview: null,
      questions: [],
      currentQuestionIndex: 0,
      recordedVideos: {},
      answeredQuestions: new Set<number>(),
      isLoading: false,
      error: null,

      // Applicant actions
      setCurrentApplicant: (applicant) => set({ currentApplicant: applicant }),

      // Interview actions
      setCurrentInterview: (interview) => set({ currentInterview: interview }),

      // Questions actions
      setQuestions: (questions) => set({ questions }),

      // Navigation actions
      setCurrentQuestionIndex: (index) => set({ currentQuestionIndex: index }),
      nextQuestion: () => {
        const { currentQuestionIndex, questions } = get();
        if (currentQuestionIndex < questions.length - 1) {
          set({ currentQuestionIndex: currentQuestionIndex + 1 });
        }
      },
      previousQuestion: () => {
        const { currentQuestionIndex } = get();
        if (currentQuestionIndex > 0) {
          set({ currentQuestionIndex: currentQuestionIndex - 1 });
        }
      },

      // Video actions
      addRecordedVideo: (questionId, blob) =>
        set((state) => ({
          recordedVideos: { ...state.recordedVideos, [questionId]: blob },
        })),
      removeRecordedVideo: (questionId) =>
        set((state) => {
          const { [questionId]: _, ...rest } = state.recordedVideos;
          return { recordedVideos: rest };
        }),
      clearRecordedVideos: () => set({ recordedVideos: {} }),

      // Answered questions (backend truth)
      setAnsweredQuestions: (questionIds: number[]) =>
        set(() => ({
          answeredQuestions: new Set<number>(questionIds),
        })),
      markQuestionAnswered: (questionId: number) =>
        set((state) => {
          const updated = new Set(state.answeredQuestions);
          updated.add(questionId);
          return { answeredQuestions: updated };
        }),
      clearAnsweredQuestions: () => set({ answeredQuestions: new Set<number>() }),

      // UI state actions
      setIsLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),

      // Reset
      reset: () =>
        set({
          currentApplicant: null,
          currentInterview: null,
          questions: [],
          currentQuestionIndex: 0,
          recordedVideos: {},
          isLoading: false,
          error: null,
        }),
    }),
    {
      name: "hirenowpro-storage",
      partialize: (state) => ({
        currentApplicant: state.currentApplicant,
        currentInterview: state.currentInterview,
        questions: state.questions,
      }),
    }
  )
);

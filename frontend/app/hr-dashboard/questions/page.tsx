"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { getHRToken } from "@/lib/auth-hr";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface TypeDetail {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
  order: number;
}

interface Question {
  id: number;
  question_text: string;
  question_type: number | TypeDetail;
  question_type_detail?: TypeDetail;
  position_type?: number | TypeDetail;
  category: number | TypeDetail;
  category_detail?: TypeDetail;
  order: number;
  is_active?: boolean;
  max_duration?: string;
  competency: string;
}

type QuestionType = "technical" | "behavioral" | "situational" | "general" | "";
type PositionType = "virtual_assistant" | "customer_service" | "it_support" | "sales_marketing" | "general" | "";

const COMPETENCY_OPTIONS = [
  { value: "communication", label: "Communication" },
  { value: "customer_handling", label: "Customer Handling" },
  { value: "problem_explanation", label: "Problem Explanation" },
  { value: "troubleshooting", label: "Troubleshooting" },
  { value: "technical_reasoning", label: "Technical Reasoning" },
  { value: "networking_concepts", label: "Networking Concepts" },
  { value: "sales_upselling", label: "Sales / Upselling" },
];

export default function QuestionsPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState<PositionType>("");
  const [typeFilter, setTypeFilter] = useState<QuestionType>("");
  const [competencyFilter, setCompetencyFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [positionTypes, setPositionTypes] = useState<TypeDetail[]>([]);
  const [questionTypes, setQuestionTypes] = useState<TypeDetail[]>([]);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [formError, setFormError] = useState("");

  // Form state for add/edit
  const [formData, setFormData] = useState({
    question_text: "",
    question_type_id: 0,
    position_type_id: 0,
    category_id: 0,
    order: 0,
    competency: "communication",
  });

  useEffect(() => {
    fetchQuestions();
    fetchPositionTypes();
    fetchQuestionTypes();
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [competencyFilter]);

  useEffect(() => {
    applyFilters();
  }, [questions, searchQuery, positionFilter, typeFilter, competencyFilter, positionTypes, questionTypes]);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Fetch all questions - try multiple approaches to handle pagination
      let allQuestions: Question[] = [];
      const params = new URLSearchParams();
      if (competencyFilter) {
        params.set("competency", competencyFilter);
      }
      let nextUrl = `${API_BASE_URL}/questions/`;

      // First try with large page size
      const query = params.toString();
      const firstResponse = await axios.get(
        `${nextUrl}?page_size=1000${query ? `&${query}` : ""}`,
        { headers },
      );

      if (firstResponse.data.results) {
        // Paginated response
        allQuestions = firstResponse.data.results;
        nextUrl = firstResponse.data.next;

        // Fetch remaining pages if any
        while (nextUrl) {
          const response = await axios.get(nextUrl, { headers });
          allQuestions = [...allQuestions, ...response.data.results];
          nextUrl = response.data.next;
        }
      } else {
        // Direct array response
        allQuestions = firstResponse.data || [];
      }

      const uniqueById = new Map<number, Question>();
      allQuestions.forEach((q) => {
        uniqueById.set(q.id, q);
      });
      setQuestions(Array.from(uniqueById.values()));
      console.log(`Total questions fetched: ${allQuestions.length}`);
    } catch (err: any) {
      console.error("Error fetching questions:", err);
      if (err.response?.status === 401) {
        setError("Authentication required. Redirecting to login...");
        setTimeout(() => router.push("/hr-login"), 1500);
      } else {
        setError(err.response?.data?.detail || "Failed to load questions");
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPositionTypes = async () => {
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get(`${API_BASE_URL}/position-types/?page_size=100`, { headers });
      const types = response.data.results || response.data || [];
      setPositionTypes(types);
    } catch (err) {
      console.error("Error fetching position types:", err);
    }
  };

  const fetchQuestionTypes = async () => {
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get(`${API_BASE_URL}/question-types/?page_size=100`, { headers });
      const types = response.data.results || response.data || [];
      setQuestionTypes(types);
    } catch (err) {
      console.error("Error fetching question types:", err);
    }
  };

  const applyFilters = () => {
    let filtered = [...questions];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter((q) => q.question_text.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // Position filter (job category)
    if (positionFilter) {
      filtered = filtered.filter((q) => {
        let code = "";
        if (typeof q.category === "object" && q.category !== null) {
          code = q.category.code;
        } else if (typeof q.category === "number") {
          const foundType = positionTypes.find((t) => t.id === q.category);
          code = foundType ? foundType.code : "";
        } else {
          code = String(q.category);
        }
        return code === positionFilter;
      });
    }

    // Type filter
    if (typeFilter) {
      filtered = filtered.filter((q) => {
        let code = "";
        if (typeof q.question_type === "object" && q.question_type !== null) {
          code = q.question_type.code;
        } else if (typeof q.question_type === "number") {
          const foundType = questionTypes.find((t) => t.id === q.question_type);
          code = foundType ? foundType.code : "";
        } else {
          code = String(q.question_type);
        }
        return code === typeFilter;
      });
    }

    if (competencyFilter) {
      filtered = filtered.filter((q) => q.competency === competencyFilter);
    }

    setFilteredQuestions(filtered);
    setCurrentPage(1);
  };

  const handleAddQuestion = () => {
    setEditingQuestion(null);
    setFormError("");
    // Set default IDs to first available type
    const defaultQuestionTypeId = questionTypes.find((t) => t.code === "general")?.id || questionTypes[0]?.id || 0;
    const defaultPositionTypeId = positionTypes.find((t) => t.code === "general")?.id || positionTypes[0]?.id || 0;

    // Calculate next order number automatically
    const maxOrder = questions.length > 0 ? Math.max(...questions.map((q) => q.order)) : -1;

    setFormData({
      question_text: "",
      question_type_id: defaultQuestionTypeId,
      position_type_id: defaultPositionTypeId,
      category_id: defaultPositionTypeId,
      order: maxOrder + 1,
      competency: "communication",
    });
    setShowAddModal(true);
  };

  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setFormError("");

    // Extract IDs from the question object
    let questionTypeId = 0;
    let positionTypeId = 0;
    let categoryId = 0;

    if (typeof question.question_type === "object" && question.question_type !== null) {
      questionTypeId = question.question_type.id;
    } else if (typeof question.question_type === "number") {
      questionTypeId = question.question_type;
    }

    if (typeof question.position_type === "object" && question.position_type !== null) {
      positionTypeId = question.position_type.id;
    } else if (typeof question.position_type === "number") {
      positionTypeId = question.position_type;
    }

    if (typeof question.category === "object" && question.category !== null) {
      categoryId = question.category.id;
    } else if (typeof question.category === "number") {
      categoryId = question.category;
    }

    const resolvedPositionTypeId = positionTypeId || categoryId;

    setFormData({
      question_text: question.question_text,
      question_type_id: questionTypeId,
      position_type_id: resolvedPositionTypeId,
      category_id: resolvedPositionTypeId,
      order: question.order,
      competency: question.competency || "communication",
    });
    setShowAddModal(true);
  };

  const handleSaveQuestion = async () => {
    if (!formData.question_text.trim()) {
      setFormError("Please enter a question text.");
      return;
    }

    if (!formData.question_type_id || !formData.position_type_id) {
      setFormError("Please select both question type and position type.");
      return;
    }

    setFormError("");
    setSaving(true);
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Ensure order is set for new entries
      let order = formData.order;
      if (!editingQuestion && !order) {
        const maxOrder = questions.length > 0 ? Math.max(...questions.map((q) => q.order)) : -1;
        order = maxOrder + 1;
      }

      const payload = {
        question_text: formData.question_text,
        question_type_id: formData.question_type_id,
        position_type_id: formData.position_type_id,
        category_id: formData.position_type_id,
        order: order,
        competency: formData.competency,
      };

      if (editingQuestion) {
        // Update existing question
        await axios.patch(`${API_BASE_URL}/questions/${editingQuestion.id}/`, payload, { headers });
      } else {
        // Create new question
        await axios.post(`${API_BASE_URL}/questions/`, payload, { headers });
      }

      setShowAddModal(false);
      fetchQuestions(); // Refresh the list
    } catch (err: any) {
      const raw = err?.response?.data;
      console.error("Error saving question:", raw);
      const normalized = normalizeSaveError(raw);
      if (normalized.positionTypeError) {
        setFormError("This question is specific to a role. Please select the correct Position Type before saving.");
      } else {
        setFormError(normalized.generalError || "Unable to save question. Please review required fields.");
      }
    } finally {
      setSaving(false);
    }
  };

  const getRoleSpecificHint = (text: string) => {
    const lowered = text.toLowerCase();
    const keywords = [
      "network engineer",
      "network_engineer",
      "system administrator",
      "site reliability engineer",
      "backend developer",
      "frontend developer",
      "database administrator",
      "security engineer",
      "full stack developer",
      "full-stack developer",
      "fullstack developer",
    ];
    return keywords.some((keyword) => lowered.includes(keyword));
  };

  const normalizeSaveError = (raw: unknown) => {
    if (raw && typeof raw === "object") {
      const data = raw as Record<string, unknown>;
      const positionType = data.position_type;
      if (Array.isArray(positionType) && positionType[0]) {
        return { positionTypeError: String(positionType[0]) };
      }
      if (typeof positionType === "string" && positionType.trim()) {
        return { positionTypeError: positionType };
      }
      if (typeof data.detail === "string" && data.detail.trim()) {
        return { generalError: data.detail };
      }
    }
    return { generalError: "Unable to save question. Please review required fields." };
  };

  const selectedPositionType = positionTypes.find((t) => t.id === formData.position_type_id);

  const handleDeleteQuestion = async (id: number) => {
    if (!confirm("Are you sure you want to delete this question?")) return;

    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      await axios.delete(`${API_BASE_URL}/questions/${id}/`, { headers });
      fetchQuestions(); // Refresh the list
    } catch (err: any) {
      console.error("Error deleting question:", err);
      alert(err.response?.data?.detail || "Failed to delete question");
    }
  };

  const formatPositionType = (type: number | TypeDetail | string) => {
    if (typeof type === "object" && type !== null) {
      return type.name;
    }
    if (typeof type === "number") {
      const foundType = positionTypes.find((t) => t.id === type);
      return foundType ? foundType.name : "Unknown";
    }
    if (typeof type === "string") {
      return type.replace(/_/g, " ").toUpperCase();
    }
    return "Unknown";
  };

  const formatQuestionType = (type: number | TypeDetail | string) => {
    if (typeof type === "object" && type !== null) {
      return type.name;
    }
    if (typeof type === "number") {
      const foundType = questionTypes.find((t) => t.id === type);
      return foundType ? foundType.name : "Unknown";
    }
    if (typeof type === "string") {
      return type.charAt(0).toUpperCase() + type.slice(1);
    }
    return "Unknown";
  };

  const getTypeColor = (type: number | TypeDetail | string) => {
    let code = "";
    if (typeof type === "object" && type !== null) {
      code = type.code;
    } else if (typeof type === "number") {
      const foundType = questionTypes.find((t) => t.id === type);
      code = foundType ? foundType.code : "";
    } else {
      code = String(type);
    }
    const colors: { [key: string]: string } = {
      technical: "bg-blue-100 text-blue-800",
      behavioral: "bg-green-100 text-green-800",
      situational: "bg-purple-100 text-purple-800",
      general: "bg-gray-100 text-gray-800",
    };
    return colors[code] || "bg-gray-100 text-gray-800";
  };

  const getPositionColor = (position: number | TypeDetail | string) => {
    let code = "";
    if (typeof position === "object" && position !== null) {
      code = position.code;
    } else if (typeof position === "number") {
      const foundType = positionTypes.find((t) => t.id === position);
      code = foundType ? foundType.code : "";
    } else {
      code = String(position);
    }
    const colors: { [key: string]: string } = {
      virtual_assistant: "bg-indigo-100 text-indigo-800",
      customer_service: "bg-pink-100 text-pink-800",
      it_support: "bg-cyan-100 text-cyan-800",
      sales_marketing: "bg-orange-100 text-orange-800",
      general: "bg-gray-100 text-gray-800",
    };
    return colors[code] || "bg-gray-100 text-gray-800";
  };

  const getStatistics = () => {
    const byPosition: { [key: string]: number } = {};
    const byType: { [key: string]: number } = {};

    questions.forEach((q) => {
      let posCode = "";
      if (typeof q.category === "object" && q.category !== null) {
        posCode = q.category.code;
      } else if (typeof q.category === "number") {
        const foundType = positionTypes.find((t) => t.id === q.category);
        posCode = foundType ? foundType.code : "unknown";
      } else {
        posCode = String(q.category);
      }

      let typeCode = "";
      if (typeof q.question_type === "object" && q.question_type !== null) {
        typeCode = q.question_type.code;
      } else if (typeof q.question_type === "number") {
        const foundType = questionTypes.find((t) => t.id === q.question_type);
        typeCode = foundType ? foundType.code : "unknown";
      } else {
        typeCode = String(q.question_type);
      }

      byPosition[posCode] = (byPosition[posCode] || 0) + 1;
      byType[typeCode] = (byType[typeCode] || 0) + 1;
    });

    return { byPosition, byType };
  };

  const stats = getStatistics();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <div className="flex items-center space-x-3 mb-3">
            <span className="text-2xl">⚠️</span>
            <h3 className="text-lg font-semibold text-red-900">Error</h3>
          </div>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Interview Questions</h1>
            <p className="text-gray-600 mt-1">Manage questions for each position type</p>
          </div>
        </div>

        <button
          onClick={handleAddQuestion}
          className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="font-semibold">Add Question</span>
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border-2 border-indigo-200 rounded-xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Total Questions</h3>
            <span className="text-3xl">❓</span>
          </div>
          <p className="text-4xl font-bold text-indigo-600">{questions.length}</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Technical</h3>
            <span className="text-3xl">💻</span>
          </div>
          <p className="text-4xl font-bold text-blue-600">{stats.byType.technical || 0}</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Behavioral</h3>
            <span className="text-3xl">🎭</span>
          </div>
          <p className="text-4xl font-bold text-green-600">{stats.byType.behavioral || 0}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Situational</h3>
            <span className="text-3xl">🎯</span>
          </div>
          <p className="text-4xl font-bold text-purple-600">{stats.byType.situational || 0}</p>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium text-gray-700">Items per page:</label>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="text-sm text-gray-600">
          Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredQuestions.length)} to{" "}
          {Math.min(currentPage * itemsPerPage, filteredQuestions.length)} of {filteredQuestions.length} questions
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search Questions</label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search question text..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Position Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Position Type</label>
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value as PositionType)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All Positions</option>
              {positionTypes.map((type) => (
                <option key={type.id} value={type.code}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Question Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as QuestionType)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              {questionTypes.map((type) => (
                <option key={type.id} value={type.code}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          {/* Competency Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Competency</label>
            <select
              value={competencyFilter}
              onChange={(e) => setCompetencyFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All Competencies</option>
              {COMPETENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Questions List */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold">Order</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Question</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Type</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Position</th>
                <th className="px-6 py-4 text-center text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center space-y-3">
                      <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p className="text-lg font-medium">No questions found</p>
                      <p className="text-sm">Try adjusting your filters or add a new question</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredQuestions
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((question) => (
                    <tr key={question.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-800 rounded-full font-semibold text-sm">
                          {question.order}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-900 line-clamp-2">{question.question_text}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 text-xs font-semibold rounded-full ${getTypeColor(
                            question.question_type
                          )}`}
                        >
                          {formatQuestionType(question.question_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 text-xs font-semibold rounded-full ${getPositionColor(
                            question.category
                          )}`}
                        >
                          {formatPositionType(question.category)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handleEditQuestion(question)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit Question"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteQuestion(question.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Question"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Buttons */}
        {filteredQuestions.length > itemsPerPage && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Previous</span>
            </button>

            <div className="flex items-center space-x-2">
              {Array.from({ length: Math.ceil(filteredQuestions.length / itemsPerPage) }, (_, i) => i + 1)
                .filter((page) => {
                  const totalPages = Math.ceil(filteredQuestions.length / itemsPerPage);
                  return page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1);
                })
                .map((page, idx, arr) => (
                  <div key={page} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== page - 1 && <span className="px-2 text-gray-500">...</span>}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === page
                          ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {page}
                    </button>
                  </div>
                ))}
            </div>

            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, Math.ceil(filteredQuestions.length / itemsPerPage)))
              }
              disabled={currentPage === Math.ceil(filteredQuestions.length / itemsPerPage)}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span>Next</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold">{editingQuestion ? "Edit Question" : "Add New Question"}</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Question Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Question Text <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.question_text}
                  onChange={(e) => {
                    setFormData({ ...formData, question_text: e.target.value });
                    if (formError) {
                      setFormError("");
                    }
                  }}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter the interview question..."
                />
              </div>

              {/* Question Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Question Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.question_type_id}
                  onChange={(e) => {
                    setFormData({ ...formData, question_type_id: parseInt(e.target.value) });
                    if (formError) {
                      setFormError("");
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Select Question Type</option>
                  {questionTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Job Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Position Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.position_type_id}
                  onChange={(e) => {
                    const nextId = parseInt(e.target.value);
                    setFormData({ ...formData, position_type_id: nextId, category_id: nextId });
                    if (formError) {
                      setFormError("");
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Select Position Type</option>
                  {positionTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                {formError && (
                  <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    {formError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Job Category (informational)</label>
                <input
                  type="text"
                  value={selectedPositionType ? selectedPositionType.name : "Select a position type first"}
                  readOnly
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                />
              </div>

              {/* Competency (replaces tags/subroles) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Competency <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.competency}
                  onChange={(e) => setFormData((prev) => ({ ...prev, competency: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {COMPETENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Questions are competency-based for the Initial Interview; no manual tags or subroles needed.
                </p>
              </div>

              {getRoleSpecificHint(formData.question_text) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  This question appears role-specific.
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => setShowAddModal(false)}
                  disabled={saving}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveQuestion}
                  disabled={saving || !formData.position_type_id}
                  className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : editingQuestion ? "Update Question" : "Add Question"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

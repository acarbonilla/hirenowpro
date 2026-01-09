"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { getHRToken } from "@/lib/auth-hr";
import { authAPI } from "@/lib/api";
import { Plus, Edit2, Trash2, Save, X, Briefcase } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface Position {
  id: number;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  order: number;
  employment_type?: string;
  salary_min?: string | null;
  salary_max?: string | null;
  salary_currency?: string | null;
  key_responsibilities?: string;
  required_skills?: string;
  qualifications?: string;
  category?: number | null;
  category_detail?: { id: number; name: string; description_context?: string | null };
  offices_detail?: {
    id: number;
    name: string;
  }[];
}

export default function PositionsManagementPage() {
  const router = useRouter();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [officesOptions, setOfficesOptions] = useState<{ id: number; name: string; address?: string }[]>([]);
  const [categoriesOptions, setCategoriesOptions] = useState<
    { id: number; name: string; description_context?: string | null }[]
  >([]);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    employment_type: "Full-time",
    salary_min: "",
    salary_max: "",
    salary_currency: "PHP",
    key_responsibilities: "",
    required_skills: "",
    qualifications: "",
    is_active: true,
    order: 0,
    category: null as number | null,
    offices: [] as number[],
  });
  const selectedCategory = categoriesOptions.find((c) => c.id === (formData.category ?? -1));

  const checkAccess = async () => {
    const token = getHRToken();
    if (!token) {
      router.push("/hr-login");
      return false;
    }

    try {
      const authRes = await authAPI.checkAuth();
      const perms = authRes.data?.permissions || {};
      const isHRStaff = perms.is_hr_recruiter || perms.is_hr_manager || perms.is_superuser;
      if (!isHRStaff) {
        router.push("/hr-login");
        return false;
      }
      const canEditPositions = perms.is_hr_recruiter || perms.is_superuser;
      setCanEdit(canEditPositions);
      setIsReadOnly(!canEditPositions);
      return true;
    } catch (err) {
      router.push("/hr-login");
      return false;
    }
  };

  const fetchPositions = async () => {
    try {
      const token = getHRToken();
      if (!token) {
        router.push("/hr-login");
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/positions/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setPositions(response.data.results || response.data);
      setLoading(false);
    } catch (err: any) {
      console.error("Error fetching positions:", err);
      setError(err.response?.data?.detail || "Failed to load positions");
      setLoading(false);
    }
  };

  const fetchOffices = async () => {
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get(`${API_BASE_URL}/offices/`, { headers });
      const data = response.data.results || response.data || [];
      setOfficesOptions(data);
    } catch (err) {
      console.error("Error fetching offices:", err);
    }
  };

  const fetchCategories = async () => {
    try {
      const token = getHRToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get(`${API_BASE_URL}/job-categories/`, { headers });
      const data = response.data.results || response.data || [];
      setCategoriesOptions(data);
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  };

  const initialize = async () => {
    const allowed = await checkAccess();
    if (!allowed) return;
    await Promise.all([fetchPositions(), fetchOffices(), fetchCategories()]);
  };

  useEffect(() => {
    initialize();
  }, []);

  const handleAdd = () => {
    if (!canEdit) {
      setError("You have read-only access to positions.");
      return;
    }
    setFormData({
      code: "",
      name: "",
      description: "",
      employment_type: "Full-time",
      salary_min: "",
      salary_max: "",
      salary_currency: "PHP",
      key_responsibilities: "",
      required_skills: "",
      qualifications: "",
      is_active: true,
      order: positions.length,
      category: null,
      offices: [],
    });
    setEditingPosition(null);
    setShowAddModal(true);
  };

  const handleOfficeChange = (value: number | string | Array<number | string>) => {
    const normalized = Array.isArray(value) ? value.map((v) => Number(v)) : [Number(value)];
    const filtered = normalized.filter((v) => !isNaN(v) && v > 0);
    setFormData((prev) => ({
      ...prev,
      offices: filtered.length ? Array.from(new Set([...(prev.offices || []), ...filtered])) : prev.offices,
    }));
  };

  const handleEdit = (position: Position) => {
    if (!canEdit) {
      setError("You have read-only access to positions.");
      return;
    }
    setFormData({
      code: position.code,
      name: position.name,
      description: position.description,
      employment_type: position.employment_type || "Full-time",
      salary_min: position.salary_min ?? "",
      salary_max: position.salary_max ?? "",
      salary_currency: position.salary_currency || "PHP",
      key_responsibilities: position.key_responsibilities || "",
      required_skills: position.required_skills || "",
      qualifications: position.qualifications || "",
      is_active: position.is_active,
      order: position.order,
      category: position.category_detail?.id ?? null,
      offices: (position.offices_detail || []).map((o) => Number(o.id)),
    });
    setEditingPosition(position);
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      setError("You have read-only access to positions.");
      return;
    }
    try {
      const token = getHRToken();
      if (!token) {
        router.push("/hr-login");
        return;
      }

      const payload = {
        ...formData,
        salary_min: formData.salary_min ? formData.salary_min : null,
        salary_max: formData.salary_max ? formData.salary_max : null,
        salary_currency: formData.salary_currency || "PHP",
        offices: Array.isArray(formData.offices) ? formData.offices.map((id) => Number(id)) : [],
        category: formData.category !== null ? Number(formData.category) : null,
      };

      if (editingPosition) {
        // Update existing position
        await axios.put(`${API_BASE_URL}/positions/${editingPosition.id}/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        // Create new position
        await axios.post(`${API_BASE_URL}/positions/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      setShowAddModal(false);
      fetchPositions();
    } catch (err: any) {
      console.error("Error saving position:", err);
      setError(err.response?.data?.detail || "Failed to save position");
    }
  };

  const handleDelete = async (id: number) => {
    if (!canEdit) {
      setError("You have read-only access to positions.");
      return;
    }
    if (!confirm("Are you sure you want to delete this position? This may affect existing interviews.")) {
      return;
    }

    try {
      const token = getHRToken();
      if (!token) {
        router.push("/hr-login");
        return;
      }

      await axios.delete(`${API_BASE_URL}/positions/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      fetchPositions();
    } catch (err: any) {
      console.error("Error deleting position:", err);
      setError(err.response?.data?.detail || "Failed to delete position");
    }
  };

  const toggleActive = async (position: Position) => {
    if (!canEdit) {
      setError("You have read-only access to positions.");
      return;
    }
    try {
      const token = getHRToken();
      if (!token) {
        router.push("/hr-login");
        return;
      }

      await axios.patch(
        `${API_BASE_URL}/positions/${position.id}/`,
        { is_active: !position.is_active },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      fetchPositions();
    } catch (err: any) {
      console.error("Error updating position:", err);
      setError(err.response?.data?.detail || "Failed to update position");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading positions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Briefcase className="h-8 w-8 text-purple-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Position Management</h1>
                <p className="text-gray-600">Manage job positions and their configurations</p>
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={!canEdit}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                canEdit ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-gray-200 text-gray-500 cursor-not-allowed"
              }`}
            >
              <Plus className="h-5 w-5" />
              <span>{canEdit ? "Add Position" : "Read-only"}</span>
            </button>
          </div>
        </div>

        {isReadOnly && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg mb-6">
            Positions are read-only for HR Managers. Contact an HR Recruiter to make changes.
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
            <button onClick={() => setError("")} className="float-right font-bold">
              ×
            </button>
          </div>
        )}

        {/* Positions Cards */}
        {positions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No positions found. Add your first position to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {positions.map((position) => (
              <div
                key={position.id}
                className="relative bg-white border rounded-lg shadow-sm p-6 transition hover:shadow-md hover:scale-[1.01]"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-gray-900">{position.name}</h3>
                    {position.category_detail?.name && (
                      <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                        {position.category_detail.name}
                      </span>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${
                      position.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {position.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="mt-3">
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                    {position.code}
                  </span>
                </div>

                <p className="mt-4 text-sm text-gray-700 leading-relaxed line-clamp-3">
                  {position.description || "No description"}
                </p>

                <div className="mt-4 space-y-2">
                  <p className="text-sm font-semibold text-gray-700">Offices</p>
                  {position.offices_detail && position.offices_detail.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {position.offices_detail.map((o) => (
                        <span
                          key={`pos-${position.id}-office-${o.id}`}
                          className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700"
                        >
                          {o.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">Offices: None</p>
                  )}
                </div>

                <div className="mt-6 border-t pt-4 flex items-center justify-end space-x-4">
                  <button
                    onClick={() => handleEdit(position)}
                    disabled={!canEdit}
                    className={`text-sm flex items-center space-x-1 ${
                      canEdit ? "text-blue-600 hover:underline" : "text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <Edit2 className="h-4 w-4" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(position.id)}
                    disabled={!canEdit}
                    className={`text-sm flex items-center space-x-1 ${
                      canEdit ? "text-red-600 hover:underline" : "text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingPosition ? "Edit Position" : "Add New Position"}
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Position Code *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., virtual-assistant, IT, customer-service"
                  required
                  disabled={!!editingPosition}
                />
                <p className="text-xs text-gray-500 mt-1">Unique identifier (cannot be changed after creation)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Position Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., Virtual Assistant, IT Support Specialist"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
                <select
                  value={formData.category ?? ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      category: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                >
                  <option value="">Select category</option>
                  {categoriesOptions.map((cat) => (
                    <option key={`category-${cat.id}`} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1 min-h-[1.5rem]">
                  {selectedCategory?.description_context
                    ? selectedCategory.description_context
                    : "Add a category description to guide HR on scope and interview focus."}
                </p>
              </div>

              <div className="text-xs text-gray-500">
                Questions are competency-based for the Initial Interview; subroles are no longer required for positions.
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Office Locations</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.offices.length === 0 && (
                    <span className="text-sm text-gray-500">No offices selected</span>
                  )}
                  {formData.offices.map((officeId) => {
                    const office = officesOptions.find((o) => o.id === officeId);
                    if (!office) return null;
                    return (
                      <span
                        key={`office-pill-${officeId}`}
                        className="inline-flex items-center px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full"
                      >
                        {office.name}
                        <button
                          type="button"
                          className="ml-2 text-purple-800 hover:text-purple-900"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              offices: prev.offices.filter((id) => id !== officeId),
                            }))
                          }
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
                <select
                  value=""
                  onChange={(e) => handleOfficeChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">Select office</option>
                  {(!officesOptions || officesOptions.length === 0)
                    ? null
                    : officesOptions
                        .filter((o) => !formData.offices.includes(o.id))
                        .map((office) => (
                          <option key={`office-option-${office.id}`} value={office.id}>
                            {office.name}
                          </option>
                        ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Employment Type</label>
                  <select
                    value={formData.employment_type}
                    onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Salary Currency</label>
                  <input
                    type="text"
                    value={formData.salary_currency}
                    onChange={(e) => setFormData({ ...formData, salary_currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., PHP, USD"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Salary Min</label>
                  <input
                    type="number"
                    value={formData.salary_min}
                    onChange={(e) => setFormData({ ...formData, salary_min: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., 15000"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Salary Max</label>
                  <input
                    type="number"
                    value={formData.salary_max}
                    onChange={(e) => setFormData({ ...formData, salary_max: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., 30000"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">About the Role</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  rows={3}
                  placeholder="Brief description of the position..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Key Responsibilities</label>
                <textarea
                  value={formData.key_responsibilities}
                  onChange={(e) => setFormData({ ...formData, key_responsibilities: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  rows={2}
                  placeholder="List key responsibilities..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Required Skills</label>
                <textarea
                  value={formData.required_skills}
                  onChange={(e) => setFormData({ ...formData, required_skills: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  rows={2}
                  placeholder="List required skills..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Qualifications</label>
                <textarea
                  value={formData.qualifications}
                  onChange={(e) => setFormData({ ...formData, qualifications: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  rows={2}
                  placeholder="List qualifications..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Display Order</label>
                  <input
                    type="number"
                    value={formData.order}
                    onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={formData.is_active ? "active" : "inactive"}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === "active" })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="sticky bottom-0 bg-white border-t border-gray-200 pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg"
                >
                  <Save className="h-4 w-4" />
                  <span>{editingPosition ? "Update" : "Create"} Position</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

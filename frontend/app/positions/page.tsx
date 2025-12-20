"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Briefcase, MapPin, ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface JobPosition {
  id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  category_detail?: {
    id: number;
    name: string;
  };
  offices_detail?: {
    id: number;
    name: string;
  }[];
}

// Icon mapping based on position code
const getPositionIcon = (code: string): string => {
  const iconMap: { [key: string]: string } = {
    "virtual-assistant": "💼",
    VA: "💼",
    "customer-service": "🎧",
    CS: "🎧",
    "data-entry": "🧾",
    DE: "🧾",
    "social-media": "📱",
    IT: "🧩",
  };
  return iconMap[code] || "💼";
};

export default function OpenPositionsPage() {
  const router = useRouter();
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobPosition | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("");

  useEffect(() => {
    fetchPositions();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const handleChange = () => setIsDesktop(mediaQuery.matches);
    handleChange();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const filteredPositions = useMemo(() => {
    const keywordValue = keyword.trim().toLowerCase();
    const locationValue = locationFilter.trim().toLowerCase();
    return positions.filter((position) => {
      const text = `${position.name} ${position.description || ""}`.toLowerCase();
      if (keywordValue && !text.includes(keywordValue)) {
        return false;
      }
      if (categoryFilter !== "all" && position.category_detail?.id?.toString() !== categoryFilter) {
        return false;
      }
      if (locationValue) {
        const offices = position.offices_detail || [];
        if (offices.length === 0) {
          if (!"remote".includes(locationValue)) {
            return false;
          }
        } else {
          const matchesOffice = offices.some((office) =>
            office.name.toLowerCase().includes(locationValue),
          );
          if (!matchesOffice) {
            return false;
          }
        }
      }
      return true;
    });
  }, [positions, keyword, categoryFilter, locationFilter]);

  useEffect(() => {
    if (!isDesktop) {
      setSelectedJob(null);
      return;
    }
    if (filteredPositions.length === 0) {
      setSelectedJob(null);
      return;
    }
    if (selectedJob && !filteredPositions.some((pos) => pos.id === selectedJob.id)) {
      setSelectedJob(null);
    }
  }, [isDesktop, filteredPositions, selectedJob]);

  const fetchPositions = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/positions/`);
      const data = response.data.results || response.data;
      setPositions(data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching positions:", error);
      setLoading(false);
    }
  };

  const handleApply = (position: JobPosition) => {
    const offices = position.offices_detail || [];
    if (offices.length === 0) {
      router.push(`/register?position=${position.code}&office=null`);
    } else if (offices.length === 1) {
      router.push(`/register?position=${position.code}&office=${offices[0].id}`);
    } else {
      router.push(`/select-office?position=${position.code}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fuchsia-400 mx-auto"></div>
          <p className="mt-4 text-slate-200">Loading positions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="bg-purple-600 p-2 rounded-lg shadow-lg shadow-purple-300/40">
                <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">HireNow Pro</h1>
                <p className="text-sm text-gray-500">Open Positions</p>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2 text-purple-600 hover:text-purple-700 font-medium transition"
              >
                Home
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-indigo-700 via-purple-600 to-fuchsia-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Join Our Team</h1>
          <p className="text-xl text-purple-100 max-w-3xl mx-auto">
            We're hiring talented professionals. Apply now and start your journey with us!
          </p>
        </div>
      </div>

      {/* Positions Grid */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-10 space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Available Positions</h2>
          <p className="text-gray-600">{filteredPositions.length} open positions • Select a job to see details</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">What</label>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Role, skills, keywords"
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Any classification</label>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 transition"
              >
                <option value="all">All categories</option>
                {Array.from(
                  new Map(
                    positions
                      .filter((position) => position.category_detail)
                      .map((position) => [position.category_detail?.id, position.category_detail]),
                  ).values(),
                ).map((category) =>
                  category ? (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ) : null,
                )}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Where</label>
              <input
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                placeholder="City or Remote"
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 transition"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] gap-6 lg:gap-8">
          <div className="space-y-4">
            {filteredPositions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600">No positions available at the moment. Please check back later.</p>
              </div>
            ) : (
              filteredPositions.map((position) => {
                const isSelected = selectedJob?.id === position.id;
                return (
                  <motion.div
                    key={position.id}
                    onClick={() => {
                      if (isDesktop) {
                        setSelectedJob(position);
                      }
                    }}
                    whileHover={{ y: -4 }}
                    animate={{ scale: isSelected ? 1.01 : 1 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className={`bg-white text-gray-900 rounded-xl border shadow-sm transition-all duration-200 overflow-hidden cursor-pointer ${
                      isSelected
                        ? "border-purple-400 ring-2 ring-purple-100 shadow-lg shadow-purple-200/40"
                        : "border-gray-200 hover:shadow-lg hover:shadow-purple-100/60"
                    }`}
                  >
                    <div className="p-6 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="text-4xl">{getPositionIcon(position.code)}</div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{position.name}</h3>
                            {position.category_detail?.name && (
                              <div className="mt-1">
                                <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                                  {position.category_detail.name}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center space-x-3 mt-1 text-sm text-gray-600">
                              <span className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                                <Briefcase className="w-3 h-3 mr-1" />
                                Full-time
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                        {position.description || "Join our team!"}
                      </p>

                      <div className="space-y-2">
                        {position.offices_detail && position.offices_detail.length > 0 ? (
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Available Locations</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {position.offices_detail.map((office) => (
                                <span
                                  key={office.id}
                                  className="inline-flex items-center px-3 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full"
                                >
                                  <MapPin className="w-3 h-3 mr-1" />
                                  {office.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Available Locations</p>
                            <span className="inline-flex items-center px-3 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                              Remote Only
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>

          {isDesktop && (
            <div className="bg-white text-gray-900 rounded-2xl border border-gray-200 shadow-sm p-8 sticky top-24 h-fit">
              <AnimatePresence mode="wait">
                {selectedJob ? (
                  <motion.div
                    key={selectedJob.id}
                    initial={{ x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 24, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="space-y-6"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="text-5xl">{getPositionIcon(selectedJob.code)}</div>
                        <div>
                          <p className="text-sm text-gray-500">HireNow Pro</p>
                          <h3 className="text-2xl font-bold text-gray-900">{selectedJob.name}</h3>
                          {selectedJob.category_detail?.name && (
                            <span className="mt-2 inline-flex items-center px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                              {selectedJob.category_detail.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedJob(null)}
                        className="text-gray-400 hover:text-gray-600 text-sm"
                      >
                        Close
                      </button>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">About the role</p>
                      <p className="text-gray-700 leading-relaxed">
                        {selectedJob.description || "Join our team!"}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Location</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedJob.offices_detail && selectedJob.offices_detail.length > 0 ? (
                          selectedJob.offices_detail.map((office) => (
                            <span
                              key={office.id}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full"
                            >
                              <MapPin className="w-3 h-3 mr-1" />
                              {office.name}
                            </span>
                          ))
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                            Remote Only
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Benefits</p>
                      <ul className="text-gray-700 space-y-2 text-sm">
                        <li>Flexible work setup</li>
                        <li>Fast hiring process</li>
                        <li>Growth-focused culture</li>
                      </ul>
                    </div>

                    <button
                      onClick={() => handleApply(selectedJob)}
                      className="group relative w-full px-6 py-3 rounded-lg bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 text-white font-medium shadow-lg shadow-purple-200/60 hover:shadow-purple-300/80 transition-all hover:-translate-y-0.5"
                    >
                      <span className="relative z-10 inline-flex items-center justify-center space-x-2">
                        <span>Apply Now</span>
                        <ArrowRight className="w-4 h-4" />
                      </span>
                      <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></span>
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-center text-gray-500 py-16"
                  >
                    <p className="text-sm">Select a job to see the full details.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Benefits Section */}
      <div className="bg-gray-50 border-t border-gray-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Why Work With Us?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="text-4xl mb-3">🌿</div>
              <h3 className="font-bold text-gray-900 mb-2">Flexible</h3>
              <p className="text-gray-600">Work where you thrive</p>
            </div>
            <div className="text-center p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="text-4xl mb-3">⚡</div>
              <h3 className="font-bold text-gray-900 mb-2">Fast Hiring</h3>
              <p className="text-gray-600">Quick AI-powered interview process</p>
            </div>
            <div className="text-center p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="text-4xl mb-3">💸</div>
              <h3 className="font-bold text-gray-900 mb-2">Competitive Pay</h3>
              <p className="text-gray-600">Fair compensation for your skills</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

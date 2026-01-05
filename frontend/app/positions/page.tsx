"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  ArrowRight,
  Briefcase,
  ClipboardList,
  Headset,
  MapPin,
  Megaphone,
  MessageSquare,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideProps } from "lucide-react";
import type { JobPosition } from "@/types";
import PositionDetailModal from "@/components/PositionDetailModal";
import { formatSalaryDisplay } from "@/lib/salary";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  "virtual-assistant": Headset,
  VA: Headset,
  "customer-service": MessageSquare,
  CS: MessageSquare,
  "data-entry": ClipboardList,
  DE: ClipboardList,
  "social-media": Megaphone,
  IT: Briefcase,
};

const getPositionIcon = (code: string) => {
  const Icon = iconMap[code] || Briefcase;
  return <Icon className="h-6 w-6 text-teal-500" />;
};

export default function OpenPositionsPage() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const resumeStorageKey = "resumeInterview";
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [resumeIntent, setResumeIntent] = useState<{ interviewId: number; position?: string } | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<JobPosition | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const positionsPerPage = 6;

  useEffect(() => {
    fetchPositions();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(resumeStorageKey);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { interviewId?: number; position?: string };
      if (payload?.interviewId) {
        setResumeIntent({ interviewId: payload.interviewId, position: payload.position });
      }
    } catch {
      sessionStorage.removeItem(resumeStorageKey);
    }
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
          const matchesOffice = offices.some((office) => office.name.toLowerCase().includes(locationValue));
          if (!matchesOffice) {
            return false;
          }
        }
      }
      return true;
    });
  }, [positions, keyword, categoryFilter, locationFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPositions.length / positionsPerPage));
  const paginatedPositions = useMemo(() => {
    const start = (currentPage - 1) * positionsPerPage;
    return filteredPositions.slice(start, start + positionsPerPage);
  }, [filteredPositions, currentPage, positionsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, categoryFilter, locationFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setFocusedIndex(null);
  }, [keyword, categoryFilter, locationFilter, currentPage]);

  useEffect(() => {
    if (focusedIndex === null) return;
    const target = cardRefs.current[focusedIndex];
    target?.focus();
  }, [focusedIndex, paginatedPositions]);

  useEffect(() => {
    if (selectedPosition) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (paginatedPositions.length === 0) return;

      event.preventDefault();
      setFocusedIndex((prev) => {
        const lastIndex = paginatedPositions.length - 1;
        if (event.key === "ArrowDown") {
          return prev === null ? 0 : Math.min(lastIndex, prev + 1);
        }
        return prev === null ? lastIndex : Math.max(0, prev - 1);
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paginatedPositions, selectedPosition]);

  const fetchPositions = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/positions/`);
      const data = response.data.results || response.data;
      setPositions(data);
    } catch (error) {
      console.error("Error fetching positions:", error);
    } finally {
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

  const handleOpenModal = (position: JobPosition) => {
    setSelectedPosition(position);
  };

  const handleCloseModal = () => {
    setSelectedPosition(null);
  };

  const containerMotion = {
    initial: shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3 },
  };

  const listVariants = shouldReduceMotion
    ? undefined
    : {
        hidden: {},
        show: { transition: { staggerChildren: 0.05 } },
      };

  const cardVariants = shouldReduceMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0 },
      };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-teal-300 mx-auto" />
          <p className="mt-4 text-slate-200">Loading positions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 sm:px-10 lg:px-16">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-200/80">HireNowPro</p>
            <h1 className="mt-2 text-2xl font-semibold">Open Positions</h1>
            <p className="mt-1 text-sm text-slate-300">Select a role to begin your initial interview.</p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/50"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden px-6 pb-14 pt-10 sm:px-10 lg:px-16">
        <div className="absolute -top-32 right-[-10%] h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-[-10%] h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />

        <motion.div {...containerMotion} className="mx-auto max-w-6xl space-y-8">
          {resumeIntent && (
            <div className="flex flex-col gap-3 rounded-2xl border border-teal-300/40 bg-white/5 p-4 text-sm text-slate-200 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-teal-200">You have an interview in progress.</p>
                <p className="text-slate-300">Resume where you left off for this position.</p>
              </div>
              <button
                onClick={() => {
                  sessionStorage.removeItem(resumeStorageKey);
                  router.push(`/interview/${resumeIntent.interviewId}`);
                }}
                className="rounded-full bg-teal-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-300"
              >
                Resume Interview
              </button>
            </div>
          )}

          <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">What</label>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Role, skills, keywords"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">Category</label>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
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
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">Location</label>
              <input
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                placeholder="City or Remote"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
              />
            </div>
          </div>
        </motion.div>
      </section>

      <section className="bg-white px-6 py-14 text-slate-900 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Open Positions</p>
              <h2 className="mt-3 text-3xl font-semibold">Choose a role to start</h2>
              <p className="mt-2 text-slate-600">
                {filteredPositions.length} open positions. Apply when you are ready.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-teal-600">Initial Interview Only</span>
          </div>

          {filteredPositions.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center text-slate-600">
              There are currently no open roles. Please check back later.
            </div>
          ) : (
            <motion.div
              variants={listVariants}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="show"
              className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
            >
              {paginatedPositions.map((position, index) => {
                const salaryDisplay = formatSalaryDisplay(position);
                return (
                  <motion.div
                    key={position.id}
                    variants={cardVariants}
                    whileHover={shouldReduceMotion ? {} : { y: -6 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    onClick={() => {
                      setFocusedIndex(index);
                      cardRefs.current[index]?.focus();
                      handleOpenModal(position);
                    }}
                    onKeyDown={(event) => {
                      if (event.currentTarget !== event.target) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setFocusedIndex(index);
                        handleOpenModal(position);
                      }
                    }}
                    onFocus={() => setFocusedIndex(index)}
                    role="button"
                    tabIndex={0}
                    ref={(el) => {
                      cardRefs.current[index] = el;
                    }}
                    className={`flex h-full cursor-pointer flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-teal-300/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-400/60 focus:ring-offset-2 focus:ring-offset-white ${
                      focusedIndex === index ? "ring-2 ring-teal-300/60 ring-offset-2 ring-offset-white" : ""
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50">
                          {getPositionIcon(position.code)}
                        </span>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">{position.name}</h3>
                          {position.category_detail?.name && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                                Category
                              </span>
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                {position.category_detail.name}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-slate-600 line-clamp-3">
                        {position.description || "Join our team and start your initial interview."}
                      </p>

                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Location</p>
                        <div className="flex flex-wrap gap-2">
                          {position.offices_detail && position.offices_detail.length > 0 ? (
                            position.offices_detail.map((office) => (
                              <span
                                key={office.id}
                                className="inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700"
                              >
                                <MapPin className="mr-1 h-3 w-3" />
                                {office.name}
                              </span>
                            ))
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                              Remote only
                            </span>
                          )}
                        </div>
                      </div>
                      {salaryDisplay && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                            {salaryDisplay.label}
                          </p>
                          <p className="text-sm text-slate-600">{salaryDisplay.value}</p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setFocusedIndex(index);
                        cardRefs.current[index]?.focus();
                        handleOpenModal(position);
                      }}
                      className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900"
                    >
                      Apply / Start Interview
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </motion.div>
                );
              })}
            </motion.div>
          )}

          {filteredPositions.length > 0 && (
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600">
              <div className="font-semibold text-slate-700">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm text-slate-600">
            Initial interview only. No documents required at this stage.
          </div>
        </div>
      </section>

      <PositionDetailModal
        isOpen={!!selectedPosition}
        position={selectedPosition}
        onClose={handleCloseModal}
        onApply={handleApply}
      />
    </div>
  );
}

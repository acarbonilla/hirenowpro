"use client";

import { useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, MapPin, X } from "lucide-react";
import type { JobPosition } from "@/types";
import { formatSalaryDisplay } from "@/lib/salary";

interface PositionDetailModalProps {
  isOpen: boolean;
  position: JobPosition | null;
  onClose: () => void;
  onApply: (position: JobPosition) => void;
}

const focusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const normalizeList = (value?: string[] | string | null) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => item.trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : null;
  }
  if (typeof value === "string") {
    const cleaned = value.split("\n").map((line) => line.trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : null;
  }
  return null;
};

export default function PositionDetailModal({ isOpen, position, onClose, onApply }: PositionDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const responsibilities = useMemo(
    () => normalizeList(position?.key_responsibilities),
    [position?.key_responsibilities],
  );

  const skills = useMemo(() => normalizeList(position?.required_skills), [position?.required_skills]);

  const qualifications = useMemo(() => normalizeList(position?.qualifications), [position?.qualifications]);

  const aboutRole = useMemo(() => {
    const value = position?.about_role || position?.description || "";
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }, [position?.about_role, position?.description]);

  const salaryDisplay = useMemo(
    () => formatSalaryDisplay(position),
    [position?.salary_min, position?.salary_max, position?.salary_currency],
  );

  useEffect(() => {
    if (!isOpen) return;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      lastFocusedRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen || !position) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;
    const container = dialogRef.current;
    if (!container) return;

    const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"),
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const offices = position.offices_detail || [];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="position-detail-title"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Position Detail</p>
            <h2 id="position-detail-title" className="mt-2 text-2xl font-semibold text-slate-900">
              {position.name}
            </h2>
            {position.category_detail?.name && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Category</span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {position.category_detail.name}
                </span>
              </div>
            )}
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            aria-label="Close position details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-6 text-slate-700">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Location</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {offices.length > 0 ? (
                  offices.map((office) => (
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
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Role Code</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">{position.code}</p>
              {position.employment_type && (
                <p className="mt-2 text-sm text-slate-600">Employment type: {position.employment_type}</p>
              )}
              {salaryDisplay && (
                <p className="mt-1 text-sm text-slate-600">
                  {salaryDisplay.label}: {salaryDisplay.value}
                </p>
              )}
            </div>
          </div>

          {aboutRole && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">About the Role</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-700 whitespace-pre-line">{aboutRole}</p>
            </div>
          )}

          {responsibilities && responsibilities.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Key Responsibilities</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {responsibilities.map((item, index) => (
                  <li key={`responsibility-${index}`} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-teal-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {skills && skills.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Required Skills</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {skills.map((skill, index) => (
                  <span
                    key={`skill-${index}`}
                    className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {qualifications && qualifications.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Qualifications</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {qualifications.map((item, index) => (
                  <li key={`qualification-${index}`} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            Close
          </button>
          <button
            onClick={() => onApply(position)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-900"
          >
            Apply / Start Interview
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

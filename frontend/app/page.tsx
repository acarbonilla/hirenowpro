"use client";

import Link from "next/link";

const DIFFERENTIATORS = [
  {
    title: "Human decision preserved",
    description: "AI assists with signals, while HR remains the final decision maker.",
  },
  {
    title: "No blind AI rejection",
    description: "Applicants are never rejected by AI alone.",
  },
  {
    title: "Transparent signals",
    description: "Scoring and insights are structured and explainable.",
  },
  {
    title: "Fair to applicants",
    description: "Designed for consistency, clarity, and respectful review.",
  },
];

const FEATURES = [
  "Initial Interview automation",
  "Competency-based scoring",
  "Authenticity signals (advisory only)",
  "Async processing (fast, non-blocking)",
];

const STEPS = [
  { label: "Applicant registration", detail: "Fast, lightweight signup for candidates." },
  { label: "AI-assisted interview", detail: "Structured video responses at the applicant's pace." },
  { label: "HR review & insights", detail: "Clear summaries and evidence-based signals." },
  { label: "Human decision", detail: "Final call stays with HR leaders." },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="relative overflow-hidden">
        <div className="absolute -top-36 right-[-10%] h-96 w-96 rounded-full bg-teal-500/20 blur-3xl animate-orbit" />
        <div className="absolute top-20 left-[-15%] h-[28rem] w-[28rem] rounded-full bg-sky-500/20 blur-3xl animate-orbit-slow" />
        <div className="absolute bottom-0 right-10 h-60 w-60 rounded-full bg-emerald-400/10 blur-3xl animate-float" />

        <section className="relative px-6 pt-20 pb-16 sm:px-10 lg:px-16">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="text-sm uppercase tracking-[0.3em] text-teal-200/80 animate-fade-up animate-delay-1">
                HireNowPro - Initial Interview Platform
              </p>
              <h1 className="mt-6 text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl animate-fade-up animate-delay-2">
                AI-assisted interviews. Human-led decisions.
              </h1>
              <p className="mt-5 text-lg text-slate-200/80 animate-fade-up animate-delay-3">
                HireNowPro helps HR teams screen candidates fairly using AI - without removing human judgment.
              </p>
              <div className="mt-8 flex flex-wrap gap-4 animate-fade-up animate-delay-4">
                <Link
                  href="/positions"
                  className="rounded-full bg-teal-400 px-6 py-3 text-base font-semibold text-slate-950 transition hover:bg-teal-300"
                >
                  Try Demo / Request Access
                </Link>
                <a
                  href="#how-it-works"
                  className="rounded-full border border-white/30 px-6 py-3 text-base font-semibold text-white transition hover:border-white/60 hover:text-white"
                >
                  See How It Works
                </a>
              </div>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in animate-delay-5">
              {FEATURES.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition hover:border-teal-300/50 hover:bg-white/10"
                >
                  <p className="text-sm font-semibold text-teal-200">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section id="how-it-works" className="bg-white px-6 py-16 text-slate-900 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">How It Works</p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">A clear, ethical review loop</h2>
            <p className="mt-4 text-base text-slate-600">
              Semi-automation means speed without sacrificing judgment. The process is efficient, structured,
              and HR-led at every decision point.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {STEPS.map((step, index) => (
              <div
                key={step.label}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-6 transition hover:border-teal-300/60 hover:bg-white"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-teal-600">
                  Step {index + 1}
                </p>
                <h3 className="mt-3 text-xl font-semibold">{step.label}</h3>
                <p className="mt-2 text-sm text-slate-600">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm uppercase tracking-[0.3em] text-teal-200/80">Why Teams Trust It</p>
              <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
                Built for fairness, clarity, and control
              </h2>
              <p className="mt-4 text-base text-slate-300">
                Ethical AI should elevate human review, not replace it. HireNowPro keeps the process transparent and
                accountable.
              </p>
            </div>
            <Link
              href="/positions"
              className="rounded-full border border-teal-300/60 px-6 py-3 text-sm font-semibold text-teal-100 transition hover:border-teal-200 hover:text-white"
            >
              Start Initial Interview
            </Link>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {DIFFERENTIATORS.map((item) => (
              <div
                key={item.title}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:-translate-y-1 hover:border-teal-400/60 hover:bg-white/10"
              >
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm text-slate-300">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-16 text-slate-900 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Highlights</p>
              <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">Professional signal. Human-led outcomes.</h2>
              <p className="mt-4 text-base text-slate-600">
                Designed for HR teams who need structure, accountability, and speed without compromising fairness.
              </p>
            </div>
            <div className="space-y-4">
              {FEATURES.map((item) => (
                <div key={item} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-800">{item}</span>
                  <span className="text-xs uppercase tracking-[0.25em] text-teal-600">Active</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 px-6 py-10 text-sm text-slate-400 sm:px-10 lg:px-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>Internal preview version</span>
          <span>Built for HR teams who value fairness</span>
        </div>
      </footer>

      <style jsx global>{`
        :root {
          font-family: "Poppins", "Nunito Sans", sans-serif;
        }

        @keyframes fadeUp {
          0% {
            opacity: 0;
            transform: translateY(16px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        @keyframes orbit {
          0% {
            transform: translateY(0) translateX(0);
          }
          50% {
            transform: translateY(-18px) translateX(12px);
          }
          100% {
            transform: translateY(0) translateX(0);
          }
        }

        @keyframes float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-12px);
          }
        }

        .animate-fade-up {
          animation: fadeUp 0.3s ease-out forwards;
          opacity: 0;
        }

        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
          opacity: 0;
        }

        .animate-delay-1 {
          animation-delay: 0.05s;
        }
        .animate-delay-2 {
          animation-delay: 0.1s;
        }
        .animate-delay-3 {
          animation-delay: 0.15s;
        }
        .animate-delay-4 {
          animation-delay: 0.2s;
        }
        .animate-delay-5 {
          animation-delay: 0.25s;
        }

        .animate-orbit {
          animation: orbit 10s ease-in-out infinite;
        }

        .animate-orbit-slow {
          animation: orbit 14s ease-in-out infinite;
        }

        .animate-float {
          animation: float 8s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-up,
          .animate-fade-in,
          .animate-orbit,
          .animate-orbit-slow,
          .animate-float {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}

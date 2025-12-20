# HireNowPro Architecture Overview

## High-Level Flow (Textual Diagram)
Applicant → API → Interview → AI Processing (Redis + Celery) → Results → HR Dashboard

## Core Components
- Frontend: Next.js apps for applicants and HR. Summary-first pages; details fetched on demand.
- Backend: Django + DRF powering applicant flows, interviews, results, and HR endpoints.
- Async: Redis + Celery handling AI interview processing and background jobs.

## Data Ownership Boundaries
- Applicant data: owned by applicants; stored in applicant models; validated on intake.
- Interview data: owned by interviews; lifecycle tracked via interview status.
- AI-generated data: transcripts, scores, analysis owned by AI/processing pipeline.
- HR override data: decisions, overrides, notes owned by HR; separate from raw AI output.

## Performance Principles Adopted
- Aggregation endpoints for lists; details endpoints for heavy payloads.
- Staggered loading: summary first, then details (prevents UI stalls).
- Pagination-first design with constrained page sizes and coarse filters (date/status/outcome).

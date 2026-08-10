# CMMC 2.0 Level 2 practice corpus (pinned)

Pinned practice descriptions for **CMMC gap-analysis tickets** (`ticket_type = cmmc_gap_analysis`).

## Files

| File | Purpose |
| --- | --- |
| `cmmc-l2-practices-subset.json` | Curated subset of CMMC 2.0 Level 2 practice text used for F26-style RAG grading |

## How grading uses this

1. Ticket `initial_state.practiceIds` selects which practices students score.
2. On submit, the scorer retrieves live text from this pinned file (required practices + keyword matches from the student gap narrative).
3. Claude grades the gap analysis **only** against retrieved practice text — not model memory of CMMC.

Do not expand this into a full CMMC catalog unless product requirements call for it; keep the subset focused for the lab.

## Ticket shape (summary)

- `initial_state.companyName` / `companySummary` / per-practice `practices[].implementationSummary` — fictional company control evidence
- `initial_state.practiceIds` — subset of practice IDs from this file (GRC-07 uses 10)
- Student submits practice scores (`met` / `partial` / `not_met`), gap notes, and overall readiness `%`
- `expected_state.expectedPracticeScores` + `expectedReadinessPercent` — deterministic answer key (GRC-07: 4 met / 3 partial / 3 not_met → **55%**)
- Readiness formula: `round(100 * Σ weight(score) / N)` with `met=1`, `partial=0.5`, `not_met=0`
- `expected_state.minGapAnalysisLength` (optional) — length gate before RAG grading against this pinned file

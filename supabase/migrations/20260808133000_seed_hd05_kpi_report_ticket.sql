-- Seed HD-05 helpdesk KPI report ticket.
--
-- Students analyze a CSV of 72 resolved tickets and report:
--   average resolution hours, SLA compliance %, volume by category, median hours
-- plus a short written report.
--
-- Paths:
--   a) Manual form submission
--   b) Script sandbox (analyze.mjs / analyze.py → output/kpis.json + report.md)
--
-- ticket_type: kpi_report
-- aliases: ticket_metrics, helpdesk_kpis, csv_kpi_analysis
--
-- Idempotent: deletes prior seed rows by ticket_type + ticketCode marker.

WITH seed_tenants AS (
  SELECT id
  FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid, -- commercial
    '00000000-0000-4000-8000-000000000003'::uuid  -- dod_adjacent
  )
),
grc AS (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
)
DELETE FROM public.tickets t
USING seed_tenants st, grc
WHERE t.tenant_id = st.id
  AND t.track_id = grc.track_id
  AND t.ticket_type IN ('kpi_report', 'ticket_metrics', 'helpdesk_kpis', 'csv_kpi_analysis')
  AND (
    t.scenario_brief LIKE 'HD-05 KPI report:%'
    OR t.scenario_brief LIKE 'HD-03 KPI report:%' -- legacy KPI code before HD-05 renumber (HD-03 is now KB)
    OR t.initial_state->>'ticketCode' IN ('HD-05', 'HD-03') -- HD-03 only matched with kpi_* types above
  );

INSERT INTO public.tickets (
  tenant_id,
  track_id,
  tier,
  ticket_type,
  difficulty,
  sla_minutes,
  scenario_brief,
  initial_state,
  expected_state,
  dcwf_code,
  sort_order
)
SELECT
  st.id,
  grc.track_id,
  1,
  'kpi_report',
  'medium',
  45,
  'HD-05 KPI report: Compute average resolution, SLA compliance, category volume, and median from 72 resolved tickets',
  jsonb_build_object(
    'ticketCode', 'HD-05',
    'title', 'Compute helpdesk KPIs from resolved tickets',
    'prompt', 'Using the CSV of resolved tickets, compute average resolution time (hours), SLA compliance rate (%), ticket volume by category, and median resolution time (hours). Present the results in a short written report. You may calculate manually or with a script in the lab sandbox.',
    'csv', $csv$ticket_id,category,priority,created_at,resolved_at,sla_minutes
HD-3001,access,P1,2026-03-02T09:00:00Z,2026-03-02T09:38:00Z,60
HD-3002,access,P2,2026-03-02T12:00:00Z,2026-03-02T13:06:00Z,240
HD-3003,access,P3,2026-03-02T15:00:00Z,2026-03-02T19:35:00Z,480
HD-3004,access,P4,2026-03-02T18:00:00Z,2026-03-03T13:32:00Z,1440
HD-3005,access,P1,2026-03-02T21:00:00Z,2026-03-02T21:51:00Z,60
HD-3006,access,P2,2026-03-03T00:00:00Z,2026-03-03T01:11:00Z,240
HD-3007,access,P3,2026-03-03T03:00:00Z,2026-03-03T06:19:00Z,480
HD-3008,access,P4,2026-03-03T06:00:00Z,2026-03-04T01:34:00Z,1440
HD-3009,access,P1,2026-03-03T09:00:00Z,2026-03-03T09:44:00Z,60
HD-3010,access,P2,2026-03-03T12:00:00Z,2026-03-03T13:52:00Z,240
HD-3011,access,P3,2026-03-03T15:00:00Z,2026-03-03T21:23:00Z,480
HD-3012,access,P4,2026-03-03T18:00:00Z,2026-03-04T06:09:00Z,1440
HD-3013,access,P1,2026-03-03T21:00:00Z,2026-03-03T21:29:00Z,60
HD-3014,access,P2,2026-03-04T00:00:00Z,2026-03-04T01:44:00Z,240
HD-3015,access,P3,2026-03-04T03:00:00Z,2026-03-04T07:12:00Z,480
HD-3016,access,P4,2026-03-04T06:00:00Z,2026-03-04T23:26:00Z,1440
HD-3017,access,P1,2026-03-04T09:00:00Z,2026-03-04T09:56:00Z,60
HD-3018,access,P2,2026-03-04T12:00:00Z,2026-03-04T14:05:00Z,240
HD-3019,hardware,P3,2026-03-04T15:00:00Z,2026-03-04T19:47:00Z,480
HD-3020,hardware,P4,2026-03-04T18:00:00Z,2026-03-05T11:05:00Z,1440
HD-3021,hardware,P1,2026-03-04T21:00:00Z,2026-03-04T21:18:00Z,60
HD-3022,hardware,P2,2026-03-05T00:00:00Z,2026-03-05T01:49:00Z,240
HD-3023,hardware,P3,2026-03-05T03:00:00Z,2026-03-05T04:51:00Z,480
HD-3024,hardware,P4,2026-03-05T06:00:00Z,2026-03-06T00:01:00Z,1440
HD-3025,hardware,P1,2026-03-05T09:00:00Z,2026-03-05T09:25:00Z,60
HD-3026,hardware,P2,2026-03-05T12:00:00Z,2026-03-05T14:46:00Z,240
HD-3027,hardware,P3,2026-03-05T15:00:00Z,2026-03-05T19:13:00Z,480
HD-3028,hardware,P4,2026-03-05T18:00:00Z,2026-03-06T13:25:00Z,1440
HD-3029,hardware,P1,2026-03-05T21:00:00Z,2026-03-05T21:55:00Z,60
HD-3030,hardware,P2,2026-03-06T00:00:00Z,2026-03-06T02:12:00Z,240
HD-3031,software,P3,2026-03-06T03:00:00Z,2026-03-06T07:55:00Z,480
HD-3032,software,P4,2026-03-06T06:00:00Z,2026-03-07T01:56:00Z,1440
HD-3033,software,P1,2026-03-06T09:00:00Z,2026-03-06T09:31:00Z,60
HD-3034,software,P2,2026-03-06T12:00:00Z,2026-03-06T15:31:00Z,240
HD-3035,software,P3,2026-03-06T15:00:00Z,2026-03-06T18:06:00Z,480
HD-3036,software,P4,2026-03-06T18:00:00Z,2026-03-07T13:53:00Z,1440
HD-3037,software,P1,2026-03-06T21:00:00Z,2026-03-06T21:22:00Z,60
HD-3038,software,P2,2026-03-07T00:00:00Z,2026-03-07T02:25:00Z,240
HD-3039,software,P3,2026-03-07T03:00:00Z,2026-03-07T10:27:00Z,480
HD-3040,software,P4,2026-03-07T06:00:00Z,2026-03-07T12:00:00Z,1440
HD-3041,software,P1,2026-03-07T09:00:00Z,2026-03-07T09:12:00Z,60
HD-3042,software,P2,2026-03-07T12:00:00Z,2026-03-07T13:59:00Z,240
HD-3043,software,P3,2026-03-07T15:00:00Z,2026-03-07T18:18:00Z,480
HD-3044,software,P4,2026-03-07T18:00:00Z,2026-03-08T13:53:00Z,1440
HD-3045,software,P1,2026-03-07T21:00:00Z,2026-03-07T21:24:00Z,60
HD-3046,network,P2,2026-03-08T00:00:00Z,2026-03-08T03:42:00Z,240
HD-3047,network,P3,2026-03-08T03:00:00Z,2026-03-08T06:29:00Z,480
HD-3048,network,P4,2026-03-08T06:00:00Z,2026-03-08T22:10:00Z,1440
HD-3049,network,P1,2026-03-08T09:00:00Z,2026-03-08T09:35:00Z,60
HD-3050,network,P2,2026-03-08T12:00:00Z,2026-03-08T13:16:00Z,240
HD-3051,network,P3,2026-03-08T15:00:00Z,2026-03-08T22:21:00Z,480
HD-3052,network,P4,2026-03-08T18:00:00Z,2026-03-09T16:03:00Z,1440
HD-3053,network,P1,2026-03-08T21:00:00Z,2026-03-08T21:19:00Z,60
HD-3054,network,P2,2026-03-09T00:00:00Z,2026-03-09T03:32:00Z,240
HD-3055,network,P3,2026-03-09T03:00:00Z,2026-03-09T08:28:00Z,480
HD-3056,email,P4,2026-03-09T06:00:00Z,2026-03-09T19:57:00Z,1440
HD-3057,email,P1,2026-03-09T09:00:00Z,2026-03-09T09:12:00Z,60
HD-3058,email,P2,2026-03-09T12:00:00Z,2026-03-09T13:07:00Z,240
HD-3059,email,P3,2026-03-09T15:00:00Z,2026-03-09T16:54:00Z,480
HD-3060,email,P4,2026-03-09T18:00:00Z,2026-03-10T13:11:00Z,1440
HD-3061,email,P1,2026-03-09T21:00:00Z,2026-03-09T22:09:00Z,60
HD-3062,email,P2,2026-03-10T00:00:00Z,2026-03-10T04:53:00Z,240
HD-3063,email,P3,2026-03-10T03:00:00Z,2026-03-10T13:18:00Z,480
HD-3064,email,P4,2026-03-10T06:00:00Z,2026-03-11T19:17:00Z,1440
HD-3065,account,P1,2026-03-10T09:00:00Z,2026-03-10T10:25:00Z,60
HD-3066,account,P2,2026-03-10T12:00:00Z,2026-03-10T18:14:00Z,240
HD-3067,account,P3,2026-03-10T15:00:00Z,2026-03-11T01:27:00Z,480
HD-3068,account,P4,2026-03-10T18:00:00Z,2026-03-12T02:37:00Z,1440
HD-3069,account,P1,2026-03-10T21:00:00Z,2026-03-10T22:13:00Z,60
HD-3070,account,P2,2026-03-11T00:00:00Z,2026-03-11T05:14:00Z,240
HD-3071,account,P3,2026-03-11T03:00:00Z,2026-03-11T12:16:00Z,480
HD-3072,account,P4,2026-03-11T06:00:00Z,2026-03-12T18:24:00Z,1440
$csv$,
    'files', jsonb_build_object(
      'README.md', $readme$# HD-05: Helpdesk KPI report

Analyze `data/resolved_tickets.csv` (72 resolved tickets) and produce:

1. **averageResolutionHours** — mean of (resolved_at − created_at) in hours, rounded to 2 decimals
2. **slaCompliancePercent** — percent of tickets where resolution minutes ≤ sla_minutes, rounded to nearest integer
3. **volumeByCategory** — integer counts per category
4. **medianResolutionHours** — median resolution hours, rounded to 2 decimals

## Paths

**Manual:** enter KPIs + a short written report in the form and submit.

**Script:** complete `analyze.mjs` (browser sandbox) or `analyze.py` (Python track), write:

- `output/kpis.json`
- `report.md`

Then submit from the sandbox, or paste values into the form.

### Browser sandbox

```bash
node analyze.mjs
```

### Python (same output contract)

```bash
python analyze.py
```
$readme$,
      'data/resolved_tickets.csv', $csv$ticket_id,category,priority,created_at,resolved_at,sla_minutes
HD-3001,access,P1,2026-03-02T09:00:00Z,2026-03-02T09:38:00Z,60
HD-3002,access,P2,2026-03-02T12:00:00Z,2026-03-02T13:06:00Z,240
HD-3003,access,P3,2026-03-02T15:00:00Z,2026-03-02T19:35:00Z,480
HD-3004,access,P4,2026-03-02T18:00:00Z,2026-03-03T13:32:00Z,1440
HD-3005,access,P1,2026-03-02T21:00:00Z,2026-03-02T21:51:00Z,60
HD-3006,access,P2,2026-03-03T00:00:00Z,2026-03-03T01:11:00Z,240
HD-3007,access,P3,2026-03-03T03:00:00Z,2026-03-03T06:19:00Z,480
HD-3008,access,P4,2026-03-03T06:00:00Z,2026-03-04T01:34:00Z,1440
HD-3009,access,P1,2026-03-03T09:00:00Z,2026-03-03T09:44:00Z,60
HD-3010,access,P2,2026-03-03T12:00:00Z,2026-03-03T13:52:00Z,240
HD-3011,access,P3,2026-03-03T15:00:00Z,2026-03-03T21:23:00Z,480
HD-3012,access,P4,2026-03-03T18:00:00Z,2026-03-04T06:09:00Z,1440
HD-3013,access,P1,2026-03-03T21:00:00Z,2026-03-03T21:29:00Z,60
HD-3014,access,P2,2026-03-04T00:00:00Z,2026-03-04T01:44:00Z,240
HD-3015,access,P3,2026-03-04T03:00:00Z,2026-03-04T07:12:00Z,480
HD-3016,access,P4,2026-03-04T06:00:00Z,2026-03-04T23:26:00Z,1440
HD-3017,access,P1,2026-03-04T09:00:00Z,2026-03-04T09:56:00Z,60
HD-3018,access,P2,2026-03-04T12:00:00Z,2026-03-04T14:05:00Z,240
HD-3019,hardware,P3,2026-03-04T15:00:00Z,2026-03-04T19:47:00Z,480
HD-3020,hardware,P4,2026-03-04T18:00:00Z,2026-03-05T11:05:00Z,1440
HD-3021,hardware,P1,2026-03-04T21:00:00Z,2026-03-04T21:18:00Z,60
HD-3022,hardware,P2,2026-03-05T00:00:00Z,2026-03-05T01:49:00Z,240
HD-3023,hardware,P3,2026-03-05T03:00:00Z,2026-03-05T04:51:00Z,480
HD-3024,hardware,P4,2026-03-05T06:00:00Z,2026-03-06T00:01:00Z,1440
HD-3025,hardware,P1,2026-03-05T09:00:00Z,2026-03-05T09:25:00Z,60
HD-3026,hardware,P2,2026-03-05T12:00:00Z,2026-03-05T14:46:00Z,240
HD-3027,hardware,P3,2026-03-05T15:00:00Z,2026-03-05T19:13:00Z,480
HD-3028,hardware,P4,2026-03-05T18:00:00Z,2026-03-06T13:25:00Z,1440
HD-3029,hardware,P1,2026-03-05T21:00:00Z,2026-03-05T21:55:00Z,60
HD-3030,hardware,P2,2026-03-06T00:00:00Z,2026-03-06T02:12:00Z,240
HD-3031,software,P3,2026-03-06T03:00:00Z,2026-03-06T07:55:00Z,480
HD-3032,software,P4,2026-03-06T06:00:00Z,2026-03-07T01:56:00Z,1440
HD-3033,software,P1,2026-03-06T09:00:00Z,2026-03-06T09:31:00Z,60
HD-3034,software,P2,2026-03-06T12:00:00Z,2026-03-06T15:31:00Z,240
HD-3035,software,P3,2026-03-06T15:00:00Z,2026-03-06T18:06:00Z,480
HD-3036,software,P4,2026-03-06T18:00:00Z,2026-03-07T13:53:00Z,1440
HD-3037,software,P1,2026-03-06T21:00:00Z,2026-03-06T21:22:00Z,60
HD-3038,software,P2,2026-03-07T00:00:00Z,2026-03-07T02:25:00Z,240
HD-3039,software,P3,2026-03-07T03:00:00Z,2026-03-07T10:27:00Z,480
HD-3040,software,P4,2026-03-07T06:00:00Z,2026-03-07T12:00:00Z,1440
HD-3041,software,P1,2026-03-07T09:00:00Z,2026-03-07T09:12:00Z,60
HD-3042,software,P2,2026-03-07T12:00:00Z,2026-03-07T13:59:00Z,240
HD-3043,software,P3,2026-03-07T15:00:00Z,2026-03-07T18:18:00Z,480
HD-3044,software,P4,2026-03-07T18:00:00Z,2026-03-08T13:53:00Z,1440
HD-3045,software,P1,2026-03-07T21:00:00Z,2026-03-07T21:24:00Z,60
HD-3046,network,P2,2026-03-08T00:00:00Z,2026-03-08T03:42:00Z,240
HD-3047,network,P3,2026-03-08T03:00:00Z,2026-03-08T06:29:00Z,480
HD-3048,network,P4,2026-03-08T06:00:00Z,2026-03-08T22:10:00Z,1440
HD-3049,network,P1,2026-03-08T09:00:00Z,2026-03-08T09:35:00Z,60
HD-3050,network,P2,2026-03-08T12:00:00Z,2026-03-08T13:16:00Z,240
HD-3051,network,P3,2026-03-08T15:00:00Z,2026-03-08T22:21:00Z,480
HD-3052,network,P4,2026-03-08T18:00:00Z,2026-03-09T16:03:00Z,1440
HD-3053,network,P1,2026-03-08T21:00:00Z,2026-03-08T21:19:00Z,60
HD-3054,network,P2,2026-03-09T00:00:00Z,2026-03-09T03:32:00Z,240
HD-3055,network,P3,2026-03-09T03:00:00Z,2026-03-09T08:28:00Z,480
HD-3056,email,P4,2026-03-09T06:00:00Z,2026-03-09T19:57:00Z,1440
HD-3057,email,P1,2026-03-09T09:00:00Z,2026-03-09T09:12:00Z,60
HD-3058,email,P2,2026-03-09T12:00:00Z,2026-03-09T13:07:00Z,240
HD-3059,email,P3,2026-03-09T15:00:00Z,2026-03-09T16:54:00Z,480
HD-3060,email,P4,2026-03-09T18:00:00Z,2026-03-10T13:11:00Z,1440
HD-3061,email,P1,2026-03-09T21:00:00Z,2026-03-09T22:09:00Z,60
HD-3062,email,P2,2026-03-10T00:00:00Z,2026-03-10T04:53:00Z,240
HD-3063,email,P3,2026-03-10T03:00:00Z,2026-03-10T13:18:00Z,480
HD-3064,email,P4,2026-03-10T06:00:00Z,2026-03-11T19:17:00Z,1440
HD-3065,account,P1,2026-03-10T09:00:00Z,2026-03-10T10:25:00Z,60
HD-3066,account,P2,2026-03-10T12:00:00Z,2026-03-10T18:14:00Z,240
HD-3067,account,P3,2026-03-10T15:00:00Z,2026-03-11T01:27:00Z,480
HD-3068,account,P4,2026-03-10T18:00:00Z,2026-03-12T02:37:00Z,1440
HD-3069,account,P1,2026-03-10T21:00:00Z,2026-03-10T22:13:00Z,60
HD-3070,account,P2,2026-03-11T00:00:00Z,2026-03-11T05:14:00Z,240
HD-3071,account,P3,2026-03-11T03:00:00Z,2026-03-11T12:16:00Z,480
HD-3072,account,P4,2026-03-11T06:00:00Z,2026-03-12T18:24:00Z,1440
$csv$,
      'analyze.mjs', $mjs$/**
 * HD-05 KPI analyzer stub.
 *
 * Read data/resolved_tickets.csv and write:
 *   output/kpis.json
 *   report.md
 *
 * Run: node analyze.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const CSV_PATH = 'data/resolved_tickets.csv';

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function main() {
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));

  // TODO: compute KPIs from created_at / resolved_at / sla_minutes / category
  const kpis = {
    averageResolutionHours: 0,
    slaCompliancePercent: 0,
    medianResolutionHours: 0,
    volumeByCategory: {},
  };

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(path.join('output', 'kpis.json'), JSON.stringify(kpis, null, 2));
  fs.writeFileSync(
    'report.md',
    [
      '# Helpdesk KPI report',
      '',
      'TODO: summarize average resolution, SLA compliance, category volume, and median.',
      '',
    ].join('\n')
  );

  console.log(`Wrote output/kpis.json and report.md for ${rows.length} rows.`);
  console.log('(Complete the TODO calculations before submitting.)');
}

main();
$mjs$,
      'analyze.py', $py$"""HD-05 KPI analyzer stub (Python track).

Read data/resolved_tickets.csv and write:
  output/kpis.json
  report.md

Run: python analyze.py
"""

from __future__ import annotations

import csv
import json
import statistics
from datetime import datetime
from pathlib import Path

CSV_PATH = Path("data/resolved_tickets.csv")


def parse_rows(path: Path):
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    rows = parse_rows(CSV_PATH)

    # TODO: compute KPIs from created_at / resolved_at / sla_minutes / category
    kpis = {
        "averageResolutionHours": 0,
        "slaCompliancePercent": 0,
        "medianResolutionHours": 0,
        "volumeByCategory": {},
    }

    Path("output").mkdir(exist_ok=True)
    Path("output/kpis.json").write_text(json.dumps(kpis, indent=2) + "\n", encoding="utf-8")
    Path("report.md").write_text(
        "# Helpdesk KPI report\n\n"
        "TODO: summarize average resolution, SLA compliance, category volume, and median.\n",
        encoding="utf-8",
    )
    print(f"Wrote output/kpis.json and report.md for {len(rows)} rows.")
    print("(Complete the TODO calculations before submitting.)")


if __name__ == "__main__":
    main()
$py$,
      'output/.gitkeep', ''
    )
  ),
  jsonb_build_object(
    'averageResolutionHours', 7.27,
    'medianResolutionHours', 3.5,
    'slaCompliancePercent', 83,
    'volumeByCategory', '{"access": 18, "hardware": 12, "software": 15, "network": 10, "email": 9, "account": 8}'::jsonb,
    'hoursTolerance', 0.05,
    'slaTolerancePoints', 1,
    'minReportLength', 80,
    'requireMedian', true,
    'reportKeywords', jsonb_build_array('sla', 'resolution', 'category')
  ),
  '722',
  12
FROM (
  SELECT id
  FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
) AS st
CROSS JOIN (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
) AS grc;

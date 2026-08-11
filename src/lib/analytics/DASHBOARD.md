# PostHog funnel & retention dashboard

Product analytics events are emitted from the app (see `src/lib/analytics/events.ts`).
Build the dashboards in the PostHog UI — funnels cannot live fully in-repo.

## Core activation funnel

Create a **Funnel** insight named **Learner activation**:

| Step | Event                              | Notes                                      |
| ---- | ---------------------------------- | ------------------------------------------ |
| 1    | `funnel_signup` / `user_signed_up` | Account created                            |
| 2    | `funnel_first_lesson_opened`       | First lesson page open                     |
| 3    | `funnel_first_scenario_submitted`  | First ticket/scenario submit               |
| 4    | `funnel_first_scenario_resolved`   | First scenario scored `resolved`           |
| 5    | `funnel_second_session`            | Return visit (client, once per user)       |
| 6    | `funnel_track_completed`           | Track credential issued / enrollment done  |

**Conversion window:** 14–30 days. Aggregation: unique users (`distinct_id` = user id).

### Suggested breakdowns

- `control_family` on submit/grade steps
- `type` (ticket_type) + `tier`
- `is_admin` person property (exclude admins from learner funnels via filter)

## Retention

Create a **Retention** insight named **Weekly learner retention**:

- **Cohort event:** `funnel_signup` (or first `user_signed_in`)
- **Return event:** any of `lesson_opened`, `scenario_started`, `scenario_submitted`
- Period: weekly, lookback 8–12 weeks

Optional second retention chart:

- Cohort: `funnel_first_scenario_resolved`
- Return: `scenario_submitted` (practice habit after first win)

## Session replay focus

Enable recordings for paths matching:

- `/tracks/*/console` (GRC/helpdesk consoles — row selection affordance)
- `/tracks/*/tickets/*`

Filter recordings where `$pathname` contains `/console` and rage-click / dead-click is present.

## Feature flags (A/B audit changes)

Create these boolean / multivariate flags in PostHog (keys match `FEATURE_FLAG_KEYS`):

| Key                     | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `grc-console-row-nav`   | Console table row click / selection A/B      |
| `completion-panel-v2`   | Post-grade completion panel redesign         |
| `scenario-hint-coach`   | Tutor hint UX experiments                    |

Use `useFeatureFlag(key)` from `@/lib/analytics/featureFlags` in client components.

## Event taxonomy (properties)

Never send email, scenario brief text, or submission bodies.

| Event                | Key properties                                              |
| -------------------- | ----------------------------------------------------------- |
| `scenario_started`   | `type`, `tier`, `control_family`, `ticket_id`, `track_id`   |
| `scenario_submitted` | same as started                                             |
| `scenario_graded`    | + `score`, `duration_seconds`, `sla_met`, `score_status`    |
| `hint_used`          | `ticket_id` / `lesson_id`, `hint_tier`, `source`            |
| `lesson_opened`      | `lesson_id`, `lesson_type`, `tier`, `track_slug`            |
| `lesson_completed`   | same + optional `score`                                     |
| `track_completed`    | `track_id`, `track_slug`, `verification_id`                 |

## Export / recreate

1. Open PostHog → Insights → create funnel + retention as above.
2. Add both to a dashboard named **CyberSkill activation**.
3. (Optional) Dashboard → … → Export — store JSON under `docs/analytics/` if you want a backup.
4. Link the project from in-app `/admin/analytics` via `NEXT_PUBLIC_POSTHOG_PROJECT_ID`.

## Privacy / opt-out

- Browser **DNT** / **GPC** disables client init (`hasBrowserTrackingOptOut`).
- No dedicated in-app analytics toggle yet; `email_marketing` is **not** used as analytics opt-out.
- Dev traffic is gated unless `NEXT_PUBLIC_ANALYTICS_DEBUG=1`.

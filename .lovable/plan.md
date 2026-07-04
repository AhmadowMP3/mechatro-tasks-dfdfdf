# Gamification: Points, League Seasons, Streaks & Badges

Build a full points-and-league layer on top of the existing task flow. Admin sets points when creating/editing a task; member submits for review; admin approves → points are awarded and league updates in real time.

## 1. Task points

- Add `points` (integer, default 0, 0–1000) to `tasks`.
- New Task / Edit Task modal (admin only): free number input "Points reward", right next to Priority. Members see it read-only as a golden pill on the task card ("⭐ 25 pts").
- On admin approval (status → `done`), award `points` to `tasks.assignee_id` once (idempotent — guarded by a `points_awarded_at` timestamp so re-opening/re-approving never double-awards).

## 2. Seasons (admin-controlled league periods)

Instead of picking one fixed cadence, admin creates **Seasons** — the flexible model you asked for.

New table `league_seasons`:
- `name` (e.g. "October Sprint", "Q4 2026", "Website Launch Push")
- `starts_at`, `ends_at`
- `scope`: `global` | `project` (with optional `project_id`)
- `status`: `upcoming` | `active` | `ended`
- Only one `active` global season at a time.

Admin UI on `/league`:
- "Manage Seasons" panel (admin only): create weekly / monthly / project-scoped / custom-range season with a friendly preset picker + custom date range.
- Auto-close: a daily cron flips `active → ended` when `ends_at` passes and announces the winner (notification + activity log entry).

Points earned during a season count for that season's leaderboard. All-time totals are always shown alongside.

## 3. League page redesign (`/league`)

Three views via tabs:
1. **Current Season** — podium (gold/silver/bronze) at the top with avatars, medal icons, and animated rank chips; ranked table below with rank delta arrows (▲2 / ▼1 / — since yesterday), points, tasks completed, current streak, top badge.
2. **All-time** — hall of fame with lifetime points and total badges earned.
3. **Seasons history** — ended seasons + their winners.

Tasteful motion using existing `animate-fade-in`, `hover-scale`, and a new `animate-podium-rise` for the top-3 cards. RTL/Arabic preserved.

## 4. Streaks

- `profiles.current_streak`, `longest_streak`, `last_task_done_on`.
- Completing at least one task on consecutive days extends the streak; gap of a full day resets to 1.
- Streak ≥ 3 days grants a **+10% points bonus** on the next approval; ≥ 7 days grants **+25%** (bonus visualized in the approval toast).
- Shown as a 🔥 badge next to the user's name in the leaderboard and on the dashboard.

## 5. Achievement badges

Auto-awarded (stored in `user_badges`, unique per code):
- `first_blood` — first approved task
- `century` / `half_k` / `kilo` — 100 / 500 / 1000 lifetime points
- `speed_demon` — task completed before due date by 2+ days
- `perfectionist` — 10 approvals with zero re-review cycles
- `team_player` — completed tasks across 3+ different projects
- `on_fire` — 7-day streak
- `champion` — won any ended season
- `runner_up` — finished #2 in an ended season

Rendered as small colored chips on profile + league rows, with a tooltip explaining how each was earned.

## 6. Notifications (all four you selected)

Extend `notifications.type`:
- `points_earned` — "You earned 25 pts for '…' (+5 streak bonus)"
- `rank_up` / `first_place` — "🏆 You just took #1 in October Sprint!" / "You moved from #4 → #2"
- `season_summary` — sent when a season ends: "You finished #2 in October Sprint with 145 pts"
- `badge_unlocked` — "🎖 Badge unlocked: On Fire"

Rank re-evaluation runs inside a trigger after each `points_earned` write, so the "you took #1" notification is instant.

## 7. Dashboard podium widget

New card on `/` (home dashboard) for all users: mini gold/silver/bronze podium of the current season's top 3 with avatars and points. Links to `/league`.

## 8. Confetti on approval

When an admin approves a task and the member is the current user, a subtle confetti burst plays alongside the toast (via `canvas-confetti`, ~5kb). Also fires when a user hits a milestone badge or takes #1 for the first time in a season.

## 9. Backend structure (technical)

```text
Migration adds:
  tasks.points, tasks.points_awarded_at
  profiles.total_points, current_streak, longest_streak, last_task_done_on
  public.league_seasons (id, name, scope, project_id, starts_at, ends_at, status)
  public.season_scores  (season_id, user_id, points, tasks_done)  -- materialized on award
  public.user_badges    (user_id, code, awarded_at, meta)
  Trigger: on tasks UPDATE where status → 'done' and points > 0:
    - guard idempotency via points_awarded_at
    - apply streak + streak bonus
    - upsert season_scores for every active season the task belongs to (global + project)
    - update profiles.total_points
    - check & insert badges
    - compute rank changes → insert notifications
  RLS: everyone reads seasons + season_scores + user_badges; admins write seasons; scoring writes are trigger-only (SECURITY DEFINER)
  GRANTs on all new public tables (authenticated + service_role)
  Daily pg_cron: close ended seasons + emit season_summary notifications
```

Client:
- Reuse existing `NewTaskModal` — add Points field (admin-only) and pass through.
- `/league` page rebuilt around season selector + podium + tabs; admin-only "Manage Seasons" dialog.
- Podium component reused on home dashboard.
- `canvas-confetti` added and fired from the task approval handler + realtime `points_earned` notification listener.

## 10. Out of scope for this pass

- Point spending / rewards store.
- Team-vs-team leagues.
- Public/shared leaderboard pages.

These can come later once the core loop feels good.

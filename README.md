# Task Platform — Phase 6

To-do/task platform with role-based access control: PostgreSQL (Docker) + Fastify/TypeScript/Prisma API + a full React/Tailwind app shell (responsive sidebar, header, footer, light/dark theme), plus an AI layer — MCP server, CLI, and a Claude-powered conversational Agent — in `nilex-ai/` (see its README), surfaced here as a streaming chat widget in the dashboard itself.

## Stack

- **Database**: PostgreSQL 16 in Docker (`docker-compose.yml`), port `5433` (kept separate from any other local Postgres containers)
- **Backend**: Fastify + TypeScript + Prisma ORM, JWT auth, bcrypt password hashing — `backend/`
- **Frontend**: Vite + React + TypeScript + Tailwind CSS v4, React Router — `frontend/`

## Data model

`Role` → `User` → `Task` (creator + optional assignee, with `priority` HIGH/MEDIUM/LOW, `dueDate`, and auto-set `startedAt`/`completedAt`) → `TaskHistory` (append-only audit log of every create/assign/start/complete/update action) and `Comment` (a discussion thread on the task, separate from the audit log).

## Roles & permissions

| Capability | ADMIN | MANAGER | MEMBER |
|---|---|---|---|
| View all tasks | ✅ | ✅ | ❌ (own only) |
| View "My Tasks" | ✅ | ✅ | ✅ |
| Create / assign / edit / delete task | ✅ | ✅ | ❌ |
| Start / complete a task | ✅ (any) | ✅ (any) | ✅ (own only) |
| View task history | ✅ | ✅ | ✅ (own tasks only) |
| View users list ("Team") | ✅ | ✅ (read-only) | ❌ |
| Create / update / delete users | ✅ | ❌ | ❌ |
| Create / update / delete roles | ✅ | ❌ | ❌ |

There is no public self-registration endpoint — accounts are provisioned by an ADMIN via the Manage Users page (`POST /users`), so role assignment always goes through an authorized, role-gated path.

## Run it

```sh
# 1. Start Postgres
docker compose up -d postgres

# 2. Backend (first time: migrate + seed)
cd backend
npm install
npm run prisma:migrate   # creates schema
npm run seed              # sample roles/users/tasks
npm run dev                # http://localhost:4000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                # http://localhost:5173 (proxies /api -> :4000)
```

Seeded logins (password `password123`): `admin@example.com`, `manager@example.com`, `member@example.com`.

## UI

- Responsive left sidebar — collapsible to icon-only on desktop, off-canvas drawer on mobile — with nav items filtered per role
- Header with a notification bell (polls every 30s, unread badge, dropdown of recent activity relevant to you), theme toggle (light/dark, persisted), and user menu
- Footer
- Dashboard (stat cards, per-role content — ADMIN/MANAGER see a team-workload breakdown + 14-day completion trend, MEMBER sees "in progress"/overdue highlights — plus recent tasks and an overdue alert)
- My Tasks / All Tasks kanban boards (no drag-and-drop — status changes go through the existing Start/Complete buttons so RBAC stays server-enforced) with color-coded priority badges (red/amber/slate for High/Medium/Low) and an overdue flag on cards past their due date; All Tasks has priority/overdue filters. Clicking a task title opens a detail modal with a full history timeline, due date, started/completed timestamps + time taken, and a comment thread
- Team (read-only roster), Reports (ADMIN+MANAGER — status/priority/assignee/completion-trend charts, overdue count, average time-to-complete, with a raw-data table fallback), and Admin-only Manage Users / Manage Roles pages with full CRUD
- **Nilex AI chat widget** (floating button, every page): ask about your tasks in plain English. Auto-authenticated using your existing dashboard login — no separate sign-in inside the chat. Responses stream token-by-token, with a live "using {tool}..." indicator while it's acting. Requires `nilex-ai`'s MCP HTTP server and Agent service running (see `nilex-ai/README.md`).

## API surface (Phase 1)

- `POST /auth/login`, `GET /auth/me`
- `GET/POST/PATCH/DELETE /roles/*` (admin only)
- `GET/POST/PATCH/DELETE /users/*` (list restricted to ADMIN+MANAGER; create/update/delete admin only)
- `POST /tasks`, `GET /tasks` (ADMIN/MANAGER only, filter by `status`/`assigneeId`/`priority`/`overdue`), `GET /tasks/my`, `GET /tasks/:id`
- `PATCH /tasks/:id` (edit, incl. `priority`/`dueDate`), `PATCH /tasks/:id/assign`, `POST /tasks/:id/start`, `POST /tasks/:id/complete`, `DELETE /tasks/:id`
- `GET /tasks/:id/history`

Every assign/start/complete/update action writes a `TaskHistory` row (actor, from/to value, timestamp). All role checks are enforced server-side, not just hidden in the UI. `start`/`complete` also stamp `Task.startedAt`/`completedAt` directly, so time-to-complete never requires re-scanning history.

### API surface (Phase 5)

- `GET /notifications` — derived on-demand from `TaskHistory`, `Comment`, and `Task.dueDate`: history/comment entries where someone else acted, plus synthesized overdue/due-soon reminders, on tasks where you're the current assignee or creator; most recent 20
- `GET /reports/summary` (ADMIN+MANAGER only) — `{byStatus, byAssignee, unassignedCount, completedByDay}` (14-day zero-filled trend)

### API surface (Phase 6)

- `GET/POST /tasks/:id/comments` — a task's discussion thread; ADMIN/MANAGER can comment on any task, a MEMBER only on one assigned to them
- `reports/summary` extended with `byPriority`, `overdueCount`, `avgCompletionHours`
- `notifications` extended with `COMMENTED`/`OVERDUE`/`DUE_SOON` entries (the latter two have no "actor" — they're derived from current state, not an event)

### API docs

**http://localhost:4000/docs** — interactive Swagger UI for all 30 endpoints (raw spec at `/docs/json`), via `@fastify/swagger` + `@fastify/swagger-ui`. Click **Authorize** and paste a JWT from `POST /auth/login` (`Bearer <token>`) to try authenticated routes directly from the browser; `POST /tool-settings/sync` uses a separate `X-Sync-Key` scheme instead (the shared secret, not a user JWT).

Request body/query/param schemas are generated from the same Zod objects each route already validates with (`zod-to-json-schema`), so there's one source of truth — not two schemas that can drift apart. This does mean Fastify's own `ajv` validator now also runs against those schemas, before the handler's existing `.parse()` call — harmless double validation, but it meant a request that fails validation could come from either layer. The global error handler normalizes both into the same `{error: "Validation error", details: "..."}` shape, so the response contract stays identical either way. `/docs` itself is unauthenticated to *view* (standard for a dev/internal API) — worth gating behind auth or disabling before any real deployment.

## AI layer (Nilex AI — see `nilex-ai/README.md`)

- **Phase 2 (done)**: MCP server exposing these operations as tools (`create_task`, `assign_task`, `list_my_tasks`, `start_task`, `complete_task`, ...), plus a `nilex` CLI on the same tool registry
- **Phase 3 (done)**: Nilex Agent — Claude API tool-use loop driving those same MCP tools conversationally, as both a terminal chat (`nilex chat`) and an HTTP chat service
- **Phase 4 (done)**: streaming Tailwind chat widget in this dashboard (`ChatWidget.tsx`), talking to the Agent's HTTP service, auto-authenticated with your dashboard session
- **Phase 5 (done)**: dashboard polish — kanban task-detail history timeline, polling notifications, per-role dashboard views, basic reporting with charts
- **Phase 6 (done)**: task priority/deadlines/time-tracking/comments, end to end — new MCP tools (`add_comment`, `list_comments`), `create_task`/`update_task`/`list_all_tasks` extended with `priority`/`dueDate`/`overdue`, and a color-coded `nilex` CLI (see below)
- **Chat session identity fixes (done)**: the dashboard's chat widget now ties its session to the currently logged-in user — logging in as someone else or logging out discards any stale session instead of silently continuing to act as the previous user (`discardChatSessionIfStale()` in `frontend/src/lib/chatApi.ts`, called from `auth.tsx`'s `login()`/`logout()`). A dashboard-bridged chat session also can't call `login`/`logout` at all anymore — it can't ask an already-signed-in user to retype a password, and it can't strand itself unauthenticated with no way back in either. See `nilex-ai/README.md`'s Phase 4 section for the full mechanism.
- **Next**: tests/CI, deployment

### `nilex` CLI — Phase 6 additions

- `nilex t new -t "..." -p high --due 2026-08-01` — priority + due date on create (`--due` also accepts a bare `YYYY-MM-DD`, normalized to full ISO for you)
- `nilex t update <taskId> -p high --due 2026-08-01` — edit priority/due date (ADMIN/MANAGER)
- `nilex t list-all --priority high --overdue` — filter by priority and/or overdue-ness
- `nilex t show <taskId>` — full detail: status, priority, due date, started/completed timestamps, time taken
- `nilex t comment <taskId> "text"` / `nilex t comments <taskId>` — add to / read a task's comment thread
- Task tables and detail views are color-coded (red/amber/slate for High/Medium/Low priority, red for overdue) via a small hand-rolled ANSI helper (`src/cli/colors.ts`) — no chalk dependency, and colors auto-disable when output isn't a TTY or `NO_COLOR` is set

To run the full stack including chat: `docker compose up -d postgres` → backend (`npm run dev`) → frontend (`npm run dev`) → in `nilex-ai/`: `npm run mcp:http` and `npm run agent:server` (both need to be running for the chat widget to work).

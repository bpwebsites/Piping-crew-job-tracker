# CLAUDE.md — CrewTrack

## Project Overview

CrewTrack is a Gantt-style crew job scheduling web app for industrial/construction piping, civil, and I&E (Instrumentation & Electrical) crews. No build tools, no bundler, no framework.

**Live site:** https://crewtrack.netlify.app
**Repo:** https://github.com/bpwebsites/Piping-crew-job-tracker
**Stack:** HTML + modular vanilla JS + Supabase auth + Netlify hosting + GitHub

## Architecture

```
index.html          — HTML structure only; loads all external files
css/styles.css      — all CSS (extracted from original inline <style>)
js/config.js        — BRANCHES, HVE_ID, AUTH_MODE, _devAllowed constants
js/supabase.js      — Supabase client init, all _sb* upsert helpers, auditLog
js/auth.js          — session timeout, rate limiting, lead access modal, role activation, approval management
js/data-models.js   — STATE variables, DOM helpers, validation, loadBranch/saveBranch, localStorage cache, storage public API, pure data utilities
js/jobs.js          — people CRUD, job CRUD, vacation split/merge engine, vacation calendar ops, vacation hours tracking
js/gantt.js         — date helpers, all gantt builder functions, all render functions, drag-and-drop handlers
js/app.js           — setBranch (UI routing), toast, auto-save wrapper, seed data, INIT block
```

- **No frameworks** — vanilla JS, no React, no build step
- **Plain `<script>` tags** (not `type="module"`) — all files share one global scope; required for HTML `onclick` handlers
- **Data persistence** — localStorage for all app data (jobs, people, vacations, overtime, completed jobs, vacation hour allowances)
- **Auth** — Supabase auth (login/signup), currently stripped out; app loads with full lead access via `devBypass`
- **Deployment** — push repo to GitHub → Netlify auto-deploys

## Key Concepts

### Branches
Three independent scheduling branches: **Piping**, **Civil**, **I&E**. Each has its own crew, job queues, and vacations. They share nothing except job *names* (the same job name can exist across branches with different hours/timelines).

### Tabs
- **★ Master** — cross-branch overview table showing all jobs, their latest finish dates per branch, and a clickable timeline that shows the selected job across all three branches simultaneously
- **Piping / Civil / I&E** — per-branch views with add job form, manage crew, stats cards, and the interactive Gantt timeline with drag-and-drop
- **Vacation/Overtime** — unified calendar view for all branches; add vacations, floating holidays, overtime; manage vacation hour allowances

### HVE
HVE (id=0) is a **permanent crew member** in every branch. It represents estimation/engineering work. HVE:
- Shows on the Gantt, can have jobs assigned
- Is **not deletable**, not listed in the crew management list
- Has its own stat card showing HVE-specific hours
- HVE jobs run up to 3 concurrent slots, not sequential like crew jobs

### Roles
- **Lead** — full access: add/edit/delete jobs, manage crew, manage vacations, drag-and-drop jobs, mark jobs complete
- **Designer** — read-only Gantt access, can only use the Vacation/Overtime tab to add time off
- Auth is currently disabled (stripped out); app auto-initializes as lead. Login system exists in code but is bypassed. Login will need to be re-enabled later, possibly for Power Apps or field app deployment.

### Jobs
- Have: name, man hours, hours/week, IFA request date, assigned crew member, pending status
- Auto-calculate duration from hours and hrs/week
- Can be **pending** (gray pill with ⏳) or **approved** (colored pill)
- Status toggled in the edit modal (Approved/Pending buttons)
- Draggable between crew members and dates on the Gantt
- When a vacation overlaps a job, the job auto-splits into before/after pieces with a `groupId`

### Vacations
- Per-person, per-branch
- **Floating holidays** — direct employees get a configurable number (default 3); single-day only
- **Vacation hours** — tracked per person with allowance, used, remaining, and progress bar
- When added, jobs that overlap automatically split around the vacation
- When deleted, split jobs merge back together

### People Types
- **Direct** employees — get floating holidays, shown with blue "Direct" badge
- **Contractors** — no floating holidays, shown with yellow "Contractor" badge
- Sorted alphabetically by last name, grouped Direct-first then Contractors

### Master Tab
- Table shows all jobs across branches with latest finish date
- Jobs older than 30 days auto-hidden
- Click a row → timeline shows that job across all 3 branches simultaneously
- "Completed" button marks jobs done (collapsible completed section with undo)

## Code Structure

### CSS Custom Properties
```
--blue, --blue-dark     → brand colors
--text, --text-muted, --text-hint → text hierarchy
--bg, --surface          → backgrounds
--border, --border-strong → borders
--r, --rl               → border radii
--nw                    → name column width (165px)
--cw                    → gantt column width (20px)
--font, --mono          → font families
```

### Key Constants (JS)
```
CW=20       → gantt cell width in px
PH=46       → pill height
PG=6        → gap between pill tracks
PP=8        → lane top/bottom padding
HRS_PER_DAY=10
```

### State
- `branchData` — object keyed by branch id (`piping`, `civil`, `ie`), each containing `people`, `queues`, `vacations`, `nid`, `npid`
- `calendarPeople` / `calendarVacations` — for people added directly on the vacation tab (leads, managers not in any branch)
- `vacHoursAllowance` — keyed by `"branch:pid"` or `"cal:pid"`
- `overtimeData` — keyed same way, array of date strings
- `completedJobs` — Set of normalized job names
- Active pointers: `people`, `queues`, `vacations`, `nid`, `npid` always point to current branch

### Shared Builder Functions (refactored)
These were extracted to eliminate 3x duplication across renderers:
- `buildGanttHeader()` — workday gantt header (months, weeks, days)
- `buildCalendarHeader()` — 7-day calendar header (for vacation view)
- `assignTracks()` — assigns jobs to visual tracks (rows within a lane)
- `buildGridCells()` — renders the day cells in a lane
- `buildWeekSeps()` — week separator lines
- `buildVacBars()` — vacation overlay bars
- `buildPill()` — job pill rendering
- `buildBranchHdrRow()` — branch header row in gantt
- `scrollGanttToToday()` — scroll to today line
- `yearTabsHTML()` — year tab buttons
- `collectYears()` — available years from data
- `collectPeopleOpts()` / `populateSelect()` — person dropdown population
- `resolvePersonInfo()` — resolve person type/floating info from `source:pid`

### Key Render Functions
- `render()` — main branch Gantt
- `renderMaster()` — master job table
- `renderMasterTimeline()` — master job-focused timeline
- `renderVacCalendar()` — vacation/overtime calendar
- `renderStats()` — stat cards
- `renderPeopleList()` — crew list table
- `renderVacHoursTracker()` — vacation hours management table

### Data Flow
1. `loadData()` tries localStorage first
2. If nothing saved, seeds demo data (5 crew per branch + HVE, 10 shared job names, vacations)
3. `render()` and `refreshAll()` are wrapped to auto-call `saveData()` after every render
4. Branch switching: `saveBranch()` → update `activeBranch` → `loadBranch()` → render

## Supabase Config
```
URL:  https://nwhnjhzdeokplpmyrmjf.supabase.co
Anon: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53aG5qaHpkZW9rcGxwbXlybWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0ODkwMTAsImV4cCI6MjA5MDA2NTAxMH0.QJtCpk5MrdXMUtqZwIHNzyeMLVFLn4I1vH298zCpOSY
```
Note: The anon key is a public key (safe for frontend). Auth is currently disabled but the Supabase client is still initialized in code.

## Design Conventions

- **Font:** IBM Plex Sans (body) + IBM Plex Mono (numbers, labels, code)
- **Colors:** Industrial blue (#004f9f) primary, clean neutrals
- **Gantt palette:** 8 rotating colors for crew members, green for vacations, gray for pending
- **Branch colors:** Blue=Piping, Green=Civil, Yellow/Amber=I&E
- **Style:** Clean, utilitarian, industrial feel — not flashy. Minimal shadows, thin borders, monospace for data.
- **No build tools** — plain `<script src="...">` tags, no bundler

## Rules

1. **Never break existing functionality.** Make one change at a time and verify.
2. **Modular file structure.** Changes go in the appropriate JS file (`config.js`, `supabase.js`, `auth.js`, `data-models.js`, `jobs.js`, `gantt.js`, `app.js`). Don't add inline `<script>` blocks to `index.html`.
3. **Preserve the industrial/utilitarian aesthetic.** Don't add gradients, rounded everything, or make it look "techy."
4. **HVE is special.** id=0, not deletable, not in crew list, yellow-tinted row.
5. **Demo data seeds only on first load.** After that, localStorage persists everything.
6. **All dates are workdays only** (Mon-Fri) on the branch Gantt. The vacation calendar uses 7-day weeks.
7. **Vacation hours count Mon-Thu only** at 10hrs/day (Fridays don't count toward vacation hours used).
8. **Jobs auto-split around vacations** and merge back when vacations are deleted.
9. **The `$()` helper** is `document.getElementById`. Use it everywhere.
10. **Test in browser** after changes — open the file directly or via Netlify deploy.

## Future Plans

- **Re-enable auth** when deploying to Power Apps or as a field app
- **Migrate localStorage → Supabase database** with Row Level Security
- **Mobile/field app** version for crews in the field
- **Power App** integration is a goal — keep the app compatible
- **Audit trail** — log who made what changes
- **Input sanitization** and server-side validation once database is added

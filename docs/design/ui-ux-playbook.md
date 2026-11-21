# UI/UX playbook

How to make dash look better and feel simple to use. This is the brief for design rounds: what dash is for, what to borrow from where, what is already off, and the prompts to run.

## What dash is for

dash is one person's (or a small team's) control room for a single Docker server. It is opened for a few seconds at a time, usually to answer one question or do one job. Ranked by how often they happen:

1. **"Is everything fine?"** Glance at the board, see green, close the tab.
2. **"What's wrong?"** An alert mail or a red tile: find the service, read its logs, restart it.
3. **Routine care.** Apply updates (containers and the system), check backups ran.
4. **Changes.** Add a service or website, edit a tile, arrange the board, invite someone.
5. **Digging.** History, processes, files, databases, activity log.

Design for this order. The first job should take zero clicks and zero reading; the fifth may take a few.

## Principles

- **Healthy is quiet, problems are loud.** When everything works, the board should be calm. Something down, failing or out of date should be the most visible thing on the screen.
- **One verdict before the details.** Every view opens with a one-line answer (all running / 2 problems / backup failed last night), then the numbers.
- **Act where you look.** Restart, logs and update should be reachable from the tile or row, not only from a dialog.
- **One action is primary.** Each screen has at most one emphasized button. Destructive actions are never next to the common ones.
- **Static facts step back.** Kernel, processor and image names matter rarely; give space to things that change.
- **Same thing, same place, same name.** A count shown in two places means the same thing in both.

## References and what to borrow

| Reference                                                                                                                                                         | Borrow                                                                                                                                                                                                                                 | Applies to                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [Coolify DESIGN.md](https://github.com/coollabsio/coolify/blob/main/DESIGN.md)                                                                                    | Dashboard as a compact overview, not a metrics wall. Section heading + "View all" + table/grid toggle. A "Deploying"/"Queued" pill on the card itself. Page ground darker than cards.                                                  | Board, list view, updates in progress         |
| [Railway](https://railway.com/)                                                                                                                                   | Act on a service where you see it; settings slide in beside the board instead of replacing it.                                                                                                                                         | Service dialog, Edit tile                     |
| [Dokploy](https://dokploy.com/)                                                                                                                                   | Same stack (Next.js + shadcn): a check of where plain shadcn starts to look generic.                                                                                                                                                   | Overall finish                                |
| [Beszel](https://github.com/sghng/beszel) ([screenshots](https://www.xda-developers.com/reasons-i-use-beszel-for-monitoring-docker-setup-hardware/))              | Overview first, one page per system for detail; doesn't show everything at once.                                                                                                                                                       | Server card, processes, History               |
| [Linear UI refresh (2026)](https://linear.app/changelog/2026-03-12-ui-refresh), [redesign post](https://karrisaarinen.com/posts/how-we-redesigned-the-linear-ui/) | Keep density, cut noise: dimmer chrome, fewer icons, softer borders. Themes built in LCH so every theme has the same contrast.                                                                                                         | Theme tokens, header, borders                 |
| [Vercel navigation (2026)](https://vercel.com/changelog/dashboard-navigation-redesign-rollout)                                                                    | Most common jobs first; a floating bottom bar for one-handed phone use.                                                                                                                                                                | Header, phone layout                          |
| [Better Stack status pages](https://www.saasframe.io/saas/better-stack)                                                                                           | A single headline verdict, then uptime ticks per service.                                                                                                                                                                              | Board top, History, site uptime               |
| [GitHub status](https://www.githubstatus.com/)                                                                                                                    | The minimal benchmark for showing many services' health.                                                                                                                                                                               | Board, list view                              |
| [T3 Code](https://github.com/pingdotgg/t3code)                                                                                                                    | Quiet list items that only show a status when you are needed; what needs you floats up, the rest folds into "Settled". Actions as compact menu rows in one panel; confirm cards with one primary and the destructive choice set apart. | Board, tiles, service actions, dialogs, phone |

Screenshots and what to take from each are in [references/notes.md](references/notes.md). The images are kept locally only (third-party, ignored by git). More can be added there any time: a screenshot plus one line on what is liked about it.

## What looks off today

First impressions from `docs/screenshots/`. These are starting points for the audit, not conclusions.

**Board** (`dashboard.png`)

- No verdict: the eye has to scan every tile's dot to know everything is up. All dots are green, so they read as decoration, and a real problem (Prowlarr's "1 failing") looks the same as a normal count.
- The header has eight controls of equal weight. New service and Edit are rare jobs but sit as prominently as the bell.
- "Updates" appears as "Updates 3" in the header and "14 updates" on the server card (containers vs system) without saying which is which.
- The server card spends the top of the page on static facts (kernel, processor, Docker version).
- Processes take a large block on the main board; it is a digging tool (job 5). Full command lines can also show secrets passed as arguments.
- Every tile repeats CPU %, memory and a sparkline, which are near zero for most services. App stats chips, usage and sparkline compete inside a small tile.

**Service dialog** (`service.png`)

- Five colored buttons in a row (Stop, Restart, Edit tile, Update, Remove) all shout; Remove sits next to everyday actions.
- "last ten minutes" repeats on each chart while the range picker already says it.
- A path wraps mid-word (`/home/.../services/p` + `ostgres`).
- A flat memory line gets a full-size chart.

## Guardrails

These hold for every round (see also the README and the repo's lint scripts):

- Minimal, built from shadcn components and the theme tokens; no magic numbers.
- No layout shift: skeletons match the real layout, selection doesn't change text weight, toggles don't move content.
- No native `alert`/`confirm`/`prompt`.
- The board keeps per-width arranging; no order-based auto reflow.
- New text needs keys in `en.json` and `de.json`.
- Verify every visual change with screenshots at 320px, 768px and 1440px in every theme.
- Change only what was criticized. Offer bigger reworks in one line instead of doing them.
- One commit per change. Run typecheck, lint, lint:classes, format:check and test before committing.

## Prompts

Copy a prompt as is and paste it into Claude Code from the dash folder. Pick by what you want:

| You want                                           | Run                                                   |
| -------------------------------------------------- | ----------------------------------------------------- |
| A new look and layout, decided by you from options | **Redesign A**, pick a direction, then **Redesign B** |
| The current design, just better and easier         | **1. Audit and plan**, then **2. Polish**             |
| Small things that bug you                          | **3. Friction log**                                   |

The redesign shows options first and changes no code until you pick one. Each prompt stops for your OK before it changes anything big.

### Redesign A: Directions (no code changes)

Best with a model strong at visual design (e.g. `/model` Fable).

```
Read docs/design/ui-ux-playbook.md and docs/design/references/notes.md, and
look at the screenshots in docs/design/references/.

I want a real redesign of dash, not a polish pass: rethink layout, hierarchy
and flows for the five jobs in the playbook. Every feature stays; how it is
presented may change completely.

Make 3 distinct directions as static HTML mockups in the scratchpad, using
dash's real data shapes (read the components and lib/ to see what a tile, a
service and the server card actually show) and shadcn-style components:
- each shows: the board with everything fine, the board with one service down
  and one update waiting, the service view, and the phone layout at 320px;
  light and dark
- each starts with a short note: the idea in one sentence, which references it
  leans on, which of the five jobs it makes faster, what it gives up
- make them really different, e.g. (1) status-first: a verdict on top, quiet
  healthy tiles, problems pulled up; (2) control-room table: one dense list
  like Coolify/Beszel with actions on each row; (3) act-in-place: the board
  stays, a service opens in a side panel instead of a dialog

Screenshot every mockup and show them side by side, with your recommendation.
Don't touch the app's code. I'll pick one or mix parts.
```

### Redesign B: Build the chosen direction

Run after picking. Fill in the two blanks.

```
Build direction <number> (plus <parts from another direction, or "nothing">)
into dash.

First add a "Target design" section to docs/design/ui-ux-playbook.md: the
chosen mockup screenshots (saved to docs/design/target/) and the decisions
behind them. Commit that on its own.

Then plan small steps in this order: theme tokens and base components > header
> board and list view > service view > dialogs (New service, Updates, Backups,
History, Settings) > phone layout. Show me the plan and wait.

Per step: implement, screenshot at 320/768/1440 in every theme, compare with
the mockup, fix gaps, run the checks, commit on its own. Stop after the header
and board steps so I can try it in the dev server before you go on. Follow the
playbook's guardrails. Don't deploy.
```

### 1. Audit and plan (multi-agent)

Run with a strong model; include "use a workflow" so it may orchestrate agents.

```
Use a workflow (keep it under 10 agents). Read docs/design/ui-ux-playbook.md
first: it defines dash's jobs, principles, references and guardrails.

Phase 1 - Audit, no code changes:
- Drive the running app with Playwright at 320px, 768px and 1440px in every
  theme. Screenshot: board, list view, service dialog (each tab), New service,
  Updates, Backups, History, Settings (each tab), alerts, login.
- Per area, judge against the principles and the references in
  docs/design/references/: hierarchy, spacing rhythm, type scale, color and
  contrast, and whether status reads in under 2 seconds.
- Walk the five jobs from the playbook and count clicks, decisions and scrolls
  for each. Flag every step where I'd have to think, hunt or read.
- Check the "What looks off today" list: confirm, reject or refine each item.

Phase 2 - Plan: one ranked list (impact vs effort) with before screenshots.
Shared causes (tokens, base components) first, single screens after. Stop and
show me the plan.

Phase 3 - After my OK, per item: implement, screenshot again, have a separate
reviewer agent compare before/after against the finding and the references,
iterate until it passes. Commit each item on its own. Don't deploy.
```

### 2. Polish

Run after the structural changes, with a model good at visual taste.

```
Read docs/design/ui-ux-playbook.md. dash works but still feels raw. Using the
principles of best-in-class tools (Linear, Vercel, Raycast level), make it feel
polished: spacing rhythm, typographic hierarchy, quiet borders and surfaces,
consistent radii, clear hover/focus/pressed states, motion only where it
explains a change, and empty, loading and error states that feel intentional.
Stay within shadcn and the theme tokens; change tokens and base components
before screens. Show before/after screenshots at 320px and 1440px in all
themes, then wait for my OK before committing.
```

### 3. Friction log

Use dash normally for a week and note every moment of hesitation. Then:

```
Read docs/design/ui-ux-playbook.md. Friction from using dash this week:
- <moment>
- <moment>
Fix only these, with the smallest change that removes each one. Show
before/after for each, then commit each fix on its own.
```

Add what was learned to "What looks off today" (remove fixed items) so the next round starts from the current state.

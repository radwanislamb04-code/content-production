## Personal AI Content OS — Build Plan

Single-page dark app with fixed sidebar + top navbar, state-based section switching (no routing). All data mocked. Exact color tokens and layout from the spec.

### Design tokens (src/styles.css)
Add all colors as CSS variables + map to `@theme inline` so Tailwind classes like `bg-card`, `border-border`, `text-accent`, `text-muted` work:
- `--bg-primary #030504`, `--bg-secondary #070A08`, `--surface #0C100E`
- `--card #101513`, `--card-elevated #151B18`
- `--border #1E2622`, `--divider #2A332E`
- `--accent #52FF2E`, `--accent-hover #7CFF5B`
- `--text-primary #F3F5F2`, `--text-secondary #A7ACA7`, `--muted #6C746F`
- `--success #52FF2E`, `--warning #F6C453`, `--error #FF5D5D`
- Load Inter + JetBrains Mono via `<link>` in `__root.tsx`.

### App shell (rebuild `src/routes/index.tsx`)
- Single route holds `activeSection` state.
- Layout:
  - `Sidebar` (fixed, 64px, `bg-secondary`, right border) — logo mark, 11 nav icons, Settings bottom, active pill + left accent border, hover tooltip.
  - `TopNavbar` (fixed, `h-14`, `bg-primary/85 backdrop-blur`, bottom border) — section title left; search / theme / bell / avatar right.
  - `<main>` with `ml-16 pt-14 p-6 min-h-screen bg-bg-primary` renders the active section.

### Sections (components under `src/components/sections/`)
Each is a presentational component with mock data:
1. `Dashboard` — greeting (time-based), 4 stat cards, pipeline connector row with status badges + animated arrows, "Continue Working" + "Today's Tasks" two-column, horizontal Recent Generations scroll.
2. `Discover` — pill sub-tabs (My Posts / Competitors / Trends / All Ideas). Each tab implemented with mock IG metrics, competitor list + posts grid, collapsible IG/YT/Google trend panels with CSS bar chart, and All Ideas grid with source badges + selection glow + sticky selection banner.
3. `VideoAnalyzer` — centered input card with textarea, char count, Analyze button; output nav tabs + Hooks/Script/Title/Description/Hashtags cards revealed after mock generate.
4. `ScriptHook` — two-column: left controls (selected idea, tone, length pills, language, Generate, individual regen grid), right output stack (3 hook cards w/ recommended, editable script with `[PAUSE]`/`[EMPHASIZE]` styled spans, title, description, hashtags chips). Sticky finalize button.
5. `Storyboard` — imported script bar, character sidebar w/ add card, generated shot cards (script portion / visual / camera / transition / image prompt / overlay / voiceover), footer send-all button.
6. `VideoPrompt` — platform tabs (Runway/Kling/Pika), global settings row, shot prompt cards with negative-prompt collapse, copy/export.
7. `Planner` — 7-day grid, post pills color-coded by type, generate/manual buttons, week nav.
8. `Analyst` — 4 stat cards, top-5 posts table, observations list, refresh.
9. `ContentScore` — SVG circular score gauge, grade, 2x2 breakdown with progress bars, improvements list, re-score.
10. `DMManager` — inbox list + active conversation with suggested reply, tone badge, actions.
11. `AutoPilot` — 3 status cards, schedule timeline, run buttons, mono logs card.
12. `Settings` — left nav (API Keys / Instagram / Telegram / Schedule / Characters / Appearance) + right panel with password inputs, chip tag input for competitors, character grid.

### Shared UI primitives (`src/components/ui-app/`)
- `Card`, `StatCard`, `Pill`, `PillTab`, `PrimaryButton`, `OutlineButton`, `GhostButton`, `IconButton`, `Badge`, `SectionHeader`, `Tooltip`.
- Use existing shadcn primitives where already installed; otherwise plain divs styled with tokens (no new deps).

### Head metadata
Update `__root.tsx` head to app-specific title/description/OG ("AI Content OS — Personal Content Operating System").

### Out of scope
- No backend, no real API calls, no routing. All lists/metrics are hard-coded mock data.
- No auth. Icons via `lucide-react` (already installed).

### Technical notes
- All colors via tokens — zero hardcoded hex in JSX.
- Global font applied on `body`; mono class for logs.
- Sidebar tooltips = absolutely-positioned span shown on `group-hover`.
- Pipeline arrow pulse via a small `@keyframes` in `styles.css`.
- Char count / selected states / tab switching handled with local `useState`.

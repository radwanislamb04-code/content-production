## Goal

Apply the outstanding fixes from your last prompt: the Jepy Labs logo in the sidebar and the corrected two-column dashboard layout. Nothing else changes — no color tokens, no removed components, no routing.

## Current state (verified)

- The logo you uploaded is already stored as a CDN asset (`src/assets/jepy-logo.webp.asset.json`), but the sidebar still renders a placeholder lime diamond with the text "Content OS".
- `Dashboard.tsx` already has a `65fr / 35fr` grid and an `AIActivity` block, plus leftover Quick-Action-style cards higher up the page (grid rows at the top) that duplicate the intended right-column card.

## Changes

**1. Sidebar logo**
- Replace the diamond placeholder with the Jepy logo image (32×32, rounded) loaded from the asset pointer.
- Wordmark next to it: "Jepy" in primary text, "Labs" in lime.
- Container padding 20px 16px 16px 16px, 8px gap.

**2. Dashboard layout**
- Restructure to a fixed `1fr 320px` grid, 20px gap (stacks on small screens).
- Left column order: greeting → 4-up stats grid (12px gap) → pipeline bar → Continue Working → Recent Generations.
- Right column, sticky at top 80px: Quick Actions card (2×2 grid, icons plus-circle / lightbulb / star / trending-up) → AI Activity card (`/api/activity`, max 5 items, skeleton + empty state) → Telegram Tasks card wrapping the existing task logic.

**3. Cleanup**
- Remove the older misplaced Quick-Action / floating cards from the top of the dashboard so the right-column card is the only one.

**4. Unchanged**
- Navbar tabs (Dashboard / Projects / Templates / Library), sidebar labels and 200px width, all color tokens, all other sections.

## Technical notes

- Logo referenced via `import logo from "@/assets/jepy-logo.webp.asset.json"` → `logo.url` (CDN-served, works on static hosting).
- Data still fetched from `/api/*` with the existing skeleton/empty-state components in `ui.tsx`.
- Verification: typecheck + a headless browser pass at desktop and mobile widths to confirm the layout and logo render.

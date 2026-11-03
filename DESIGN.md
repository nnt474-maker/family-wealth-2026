# DESIGN.md — 2026 Family Wealth & Notebook OS

## Aesthetic Direction & North Star
- **Domain**: Household Financial Operating System & Investment Ledger (Chồng • Vợ • Subo • Sugi)
- **Direction (`taste-skill` + `impeccable`)**: **Pastel Consumer / Architectural Daylight Ledger** (`open-plane` shell, seed `133244828` / `seed:1754efe5bec10c35`)
- **Persona**: Calm, tactile, high-trust family accounting ledger inspired by Wise, Copilot Money, and architectural paper ledgers. Zero dark-mode neon glow, zero purple-indigo gradients, zero decorative emoji clutter.

## Color System (WCAG AA Verified)
All text pairings exceed **5.1:1** contrast on their respective surfaces:
- **Canvas Ground (`--ground`)**: `#f3f5f7` (Cool architectural daylight paper)
- **Primary Card / Ledger Surface (`--surface`)**: `#ffffff`
- **Inset / Filter / Input Surface (`--raised`)**: `#eef2f6`
- **Structural Hairline (`--border` / `--border-strong`)**: `#e2e6ea` / `#cbd2d9`
- **Primary Ink (`--text`)**: `#1b1d1f` (`16.8:1` on `--surface`)
- **Secondary Ink (`--muted`)**: `#50555a` (`6.9:1` on `--surface`, `6.1:1` on `--ground`)
- **Brand & Interactive Accent (`--accent`)**: `#1d5fd6` (Trust Cobalt, `5.6:1` with `#ffffff`)
  - Soft tint (`--accent-soft`): `#eaf1ff`, border `#bfd6ff`
- **Semantic Status Tokens**:
  - **Income / Surplus / DCA (`--positive`)**: `#216e39` (Forest Ledger Green, soft `#e8f5ec`, border `#b7e1c4`)
  - **Expense / Deficit / Alert (`--negative`)**: `#bf1d28` (Crimson Ink, soft `#fdecee`, border `#f7c4c7`)
  - **Threshold / Warning (`--warning`)**: `#8a3c0c` (Deep Amber Ochre, soft `#fef3c7`, border `#f6d28b`)

### Household Member Identity Palette (Hue Separation >= 60°)
- **Chồng (`CK`)**: Cobalt `#dcf1ff` fill / `#0a3a80` ink / `#99d5ff` border
- **Vợ (`VK`)**: Rose Berry `#fce7f3` fill / `#831843` ink / `#f9a8d4` border
- **Subo**: Warm Amber `#fef3c7` fill / `#78350f` ink / `#fcd34d` border
- **Sugi**: Mint Emerald `#d1fae5` fill / `#064e3b` ink / `#6ee7b7` border
- **Chung (Gia đình)**: Cool Slate `#e2e8f0` fill / `#1e293b` ink / `#cbd5e1` border

## Typography & Scannable Hierarchy
- **Primary Typeface**: `'Manrope'` (Google Fonts, weights `400`, `500`, `600`, `700`) with full Vietnamese diacritic support.
- **Numeric Discipline**: `font-variant-numeric: tabular-nums` enforced across all KPIs, tables, matrix cells, currency inputs, and percentages.
- **Type Scale**:
  - `--fs-2xs`: `0.8125rem` (`13px`) — minimum floor for badges, table headers, and metadata
  - `--fs-xs`: `0.8125rem` (`13px`) — compact controls and secondary labels
  - `--fs-sm`: `0.875rem` (`14px`) — table cells, form inputs, navigation items
  - `--fs-base`: `0.90625rem` (`14.5px`) — body copy
  - `--fs-md`: `1rem` (`16px`) — card titles and section headers
  - `--fs-lg`: `1.25rem` (`20px`) — modal and advisory headings
  - `--fs-xl`: `1.625rem` (`26px`) — page title (`letter-spacing: -0.025em`)
  - `--fs-kpi`: `1.75rem` (`28px`) — primary financial figures (`letter-spacing: -0.03em`)

## Layout, Spatial Architecture & Focal Point
- **Desktop (`> 1100px`)**: `248px` left navigation rail (`--surface`) + open-plane workspace (`--ground`, `padding: 24px 32px`).
- **Focal Point Above the Fold**:
  1. Compact Topbar with Month Selector (`Cả năm`, `T1`–`T12` with active data status dots and `‹` / `›` step buttons).
  2. Zero-Friction 1-Line AI Quick Entry Bar (`.quick-hero`) with live editable preview.
  3. Architectural Divided KPI Ledger Strip (`.kpi-grid`) — a unified 4-column horizontal ledger container divided by `1px solid var(--border)` vertical hairlines rather than floating glow cards.
- **Grid Alignment**: All multi-column grids (`.grid-2`, `.grid-equal`, `.advice-cards-grid`) use `align-items: start` so cards size naturally to their content without empty vertical voids.
- **Mobile (`<= 900px`)**: Sticky frosted bottom navigation bar (`.mobile-nav`) with 6 SVG-icon tabs and horizontally scrollable month pills & data tables (`-webkit-overflow-scrolling: touch`).

## Anti-Bloat & Craft Guardrails
- Zero `linear-gradient` / `radial-gradient` fills or gradient text.
- Zero purple/indigo/neon dark-mode glow shadows.
- Zero decorative emojis in UI chrome; navigation uses crisp `16px` stroke SVGs (`stroke-width="1.75"`).
- All interactive transitions explicitly target `background-color`, `border-color`, `color`, `opacity`, or `transform` (`140ms ease-out`), never `transition: all`.

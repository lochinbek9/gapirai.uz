---
name: GapirAI.uz
description: Uzbek AI dubbing and subtitles — the clean category standard, played straight.
colors:
  ground: "#F6F7F9"
  surface: "#FFFFFF"
  ink: "#0B0D12"
  muted: "#585E6A"
  rule: "#E5E7EB"
  accent: "#2B5CF0"
  accent-ink: "#204CD6"
  red: "#DC2626"
  red-ink: "#B91C1C"
  green: "#16A34A"
  green-ink: "#15803D"
  night-ground: "#121215"
  night-surface: "#0B0B0D"
  night-ink: "#F4F5F7"
  night-muted: "#A0A5B0"
  night-rule: "#27282E"
  night-accent: "#567CFF"
  night-accent-ink: "#85A3FF"
typography:
  display:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 4rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
rounded:
  control: "10px"
  tab: "8px"
  card: "16px"
  pill: "9999px"
spacing:
  gutter-mobile: "16px"
  gutter-desktop: "24px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "#FFFFFF"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 20px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
  button-disabled:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  segmented:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
---

# Design System: GapirAI.uz

## Overview

**Creative North Star: "The standard, played straight"**

GapirAI.uz should sit comfortably next to ElevenLabs, HeyGen, Rask AI and Linear/Vercel: white (or near-black) ground, neutral greys, hairline borders, one accent from the logo blue, and a confident modern sans. No metaphor, no theme. The craft is in spacing, type and states, and the hero *is* the working form.

Owner rejected (2026-10-24): the "Tashkent metro" world (marble, granite plaques, red/blue/green line colours, heavy condensed caps) as too heavy; and from the original brief, purple/blue gradients, glow, glass, decorative blur, invented claims.

**Key Characteristics:**
- Centered hero: H1 "Dunyo bilimlari oʻzbek tilida", one-line subhead, the real form card directly below.
- One accent (logo blue) for focus, selection, links and checks. Primary actions are ink, not blue.
- Hairline 1px borders; 16px cards; 10px controls; a soft shadow only on the hero form card and floating layers.
- Geist 400/500/600; display at 600 with tight negative tracking; tabular numerals for every number.
- Every number is real and dated; no unsupported badges.

## Colors

### Accent
- **Logo Blue** (#2B5CF0; dark #567CFF): focus outline, selected radio/sample/provider (border + 1px ring + 6% tint), active service card ring, progress fill. As text use **Accent Ink** (#204CD6; dark #85A3FF) — links, check icons, the "2 oy tekin" hint.

### Neutral
- **Ground** (#F6F7F9; dark #121215): alternating sections (stats, how-it-works, footer), segmented-control track, notice fills.
- **Surface** (#FFFFFF; dark #0B0B0D): page background, cards, inputs.
- **Ink** (#0B0D12; dark #F4F5F7): text and primary buttons.
- **Muted** (#585E6A; dark #A0A5B0): secondary text (≥4.5:1 on both grounds).
- **Rule** (#E5E7EB; dark #27282E): 1px borders and dividers.

### Status
- **Red / Red Ink**: errors only (30% border, 5% tint, red-ink text). **Green / Green Ink**: success confirmations only. **Amber** (Tailwind amber-500/700): warnings (YouTube restriction, discount) and filled rating stars.

### Named Rules
**The One Accent Rule.** Blue marks state and links, never decoration or large fills. Primary CTAs are ink.

## Typography

**Family:** Geist (next/font, `--font-sans`), latin + latin-ext.

### Hierarchy
- **Display** (600, 40px → 64px, lh 1.05, -0.035em, balanced): page H1 only.
- **Headline** (600, 30px → 36px, -0.03em): section titles.
- **Title** (600, 18–20px, -0.02em): card titles, plan names.
- **Body** (400, 15–18px, lh 1.6, ≤60ch): leads and descriptions in Muted.
- **Label** (500, 14px): field labels, tabs, buttons.
- Numbers: `tabular-nums` everywhere (stats, prices, durations).

### Named Rules
**The No-Shouting Rule.** No uppercase labels, no eyebrows/kickers above headings, no weight above 600.

## Layout

Max width 1152px (`max-w-6xl`), gutters 16/24px. Sections are 96px apart (`py-24`), separated by alternating Surface/Ground bands with a hairline border rather than cards-in-cards. Hero form max 720px. Services: three cards (md+). How it works: four numbered steps (order is information). Pricing: centered title, period + provider controls, three plan cards (stack below 1024px) with a label/value list, then packs, rules and FAQ in a 1 : 1.6 two-column layout.

## Elevation & Depth

Flat. Depth comes from hairlines and the Ground/Surface alternation. Shadows: hero form card `0 1px 2px rgb(0 0 0/.04), 0 12px 40px -12px rgb(0 0 0/.12)` (none in dark); selected segmented tab `0 1px 2px rgb(0 0 0/.08) + 1px rule ring`; menus/floating button `0 4–12px 16–32px rgb(0 0 0/.10–.12)`; dialogs `0 24px 64px rgb(0 0 0/.25)`.

## Shapes

Cards 16px, controls 10px, tabs/inner chips 8px, pills for status badges and the balance chip. Thumbnails 12px.

## Components

### Buttons (`.ui-btn`)
- **Primary** (`ui-btn-primary`): ink fill, white text (inverted in dark), min-height 44px (48px beside the URL field), 500 weight.
- **Secondary** (`ui-btn-secondary`): surface fill with an inset rule ring; hover fills Ground.
- **States:** hover opacity .88; pressed 1px down; disabled Ground fill + Muted text; loading spinner + verb.

### Inputs (`.ui-input`)
1px rule border, 10px radius; focus = accent border + 3px accent/15% ring. Errors: `role="alert"` box (red 30% border, 5% tint) + `aria-invalid`.

### Segmented control
Ground track with 4px padding; the selected segment is Surface with a hairline ring. Used for service (Dublyaj/Subtitr/Tahlil) and billing period. Secondary choices inside a panel (YouTube havola / Video fayl) are underline tabs instead, so controls don't nest.

### Selectable tiles
Voice gender, samples, subtitle language, payment provider: rule border; selected = accent border + 1px accent ring + 6% accent tint.

### Navigation
Sticky Surface header at 90% with backdrop blur (functional, not decorative), 64px, hairline bottom. Logo, text links (Ommaviy videolar, Tariflar, Telegram bot) from 768px, Kirish (secondary) + Bepul boshlash (primary), theme toggle, and a disclosure menu below 768px.

### Footer
Ground band, hairline top, four columns, payment logos on white tiles with a hairline.

### Page shell
Every inner page (about, FAQ, terms, privacy, donate, install, public videos, dashboard, video, analysis, subtitles, 404) uses `PageShell` (`components/PageShell.tsx`): the same sticky header and footer as the homepage, `main#main` on Surface, content at `max-w-6xl` (reading pages `max-w-3xl`), and `PageTitle` for the H1 + lead. Long legal text uses `.ui-prose`. Auth pages (login, register, forgot password) are the one exception: a minimal top bar (logo + back link) and a centered 400px card on Ground. Back links are quiet text links ("← Mening videolarim"), not icon buttons.

### Legacy classes
`.glass-card`, `.glass-input` and `.btn-premium` still exist in older markup but now render as a plain card, input and ink button; `.mesh-gradient` is hidden. Tailwind `blue-*` is remapped to the logo-blue scale and `gray/slate/zinc/neutral-*` to the neutral token scale, so untouched utility classes stay on-system. New code uses the `ui-*` tokens directly.

## Do's and Don'ts

### Do:
- **Do** keep the working form in the first viewport on every width.
- **Do** date every statistic and source it from production data.
- **Do** keep text contrast ≥4.5:1 (use the `*-ink` variants for coloured text).

### Don't:
- **Don't** use gradients, glow, glass, or more than one accent hue.
- **Don't** add uppercase/kicker labels, condensed display type, or themed metaphors.
- **Don't** add "Tavsiya etiladi"/"most popular" badges or claims without data.
- **Don't** block the first viewport with a modal; offers go in a dismissible inline strip.

---
name: GapirAI.uz
description: Uzbek AI dubbing and subtitles, designed as a Tashkent metro line.
colors:
  marble-ground: "#F1EEE8"
  marble-surface: "#FBFAF7"
  granite-ink: "#1B1B1D"
  granite-muted: "#54514C"
  joint-rule: "#D6D0C4"
  plaque-granite: "#1F1F22"
  plaque-ink: "#F4F1EB"
  brass: "#A98648"
  line-red: "#C8202B"
  line-red-ink: "#B21822"
  line-blue: "#1D5BA8"
  line-blue-ink: "#1A5298"
  line-green: "#18804A"
  line-green-ink: "#136B3D"
  night-ground: "#121214"
  night-surface: "#1C1C1F"
  night-plaque: "#28282D"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "clamp(3.25rem, 6vw, 5.25rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.1
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    letterSpacing: "0.06em"
rounded:
  hairline: "3px"
  control: "4px"
  plate: "6px"
  station: "9999px"
spacing:
  gutter-mobile: "16px"
  gutter-desktop: "32px"
  stop-gap-mobile: "96px"
  stop-gap-desktop: "128px"
components:
  button-ink:
    backgroundColor: "{colors.plaque-granite}"
    textColor: "#FFFFFF"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
    height: "48px"
    padding: "0 20px"
  button-line-red:
    backgroundColor: "{colors.line-red}"
    textColor: "#FFFFFF"
    rounded: "{rounded.plate}"
    height: "48px"
  button-line-blue:
    backgroundColor: "{colors.line-blue}"
    textColor: "#FFFFFF"
    rounded: "{rounded.plate}"
    height: "48px"
  button-line-green:
    backgroundColor: "{colors.line-green}"
    textColor: "#FFFFFF"
    rounded: "{rounded.plate}"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.granite-ink}"
    rounded: "{rounded.plate}"
    height: "48px"
  button-disabled:
    backgroundColor: "{colors.joint-rule}"
    textColor: "{colors.granite-muted}"
    rounded: "{rounded.plate}"
  input:
    backgroundColor: "{colors.marble-surface}"
    textColor: "{colors.granite-ink}"
    rounded: "{rounded.plate}"
    height: "56px"
  plaque:
    backgroundColor: "{colors.plaque-granite}"
    textColor: "{colors.plaque-ink}"
    rounded: "{rounded.plate}"
---

# Design System: GapirAI.uz

## Overview

**Creative North Star: "The Tashkent Metro Line"**

A video travels from its own language to Uzbek the way a train runs a metro line: Havola → Nutq → Tarjima → Ovoz → Tayyor. The system borrows the station, not the transit app: polished marble walls (light) or night-station granite (dark), enamel name plaques with a thick base rule, round station markers on one continuous line, and line colours that mean something. Every page hangs on that line.

Density is calm and signage-like. Headings are short condensed caps set on plaques or straight on the wall; body copy is plain, readable Barlow. Proof is concrete: the real form is the ticket machine, numbers sit on a dated station board, the train on the line moves to the job's real stage.

Confirmed rejections (owner's brief, 2026-10-24): purple/blue gradients, neon glows, decorative blur and glassmorphism, floating or repeated rounded cards, meaningless icon grids, invented claims.

**Key Characteristics:**
- One continuous red line (the spine) with ring station markers organises long pages.
- Granite enamel plaques with a 6–10px line-colour base rule carry headings, boards and table heads.
- Three line colours are semantic only: red Dublyaj, blue Subtitr, green Tahlil. One active at a time.
- One type family; hierarchy by size, width and weight, never by a second face.
- Flat surfaces, 6px plates, 2px joint borders; brass hairline only on framed boards and pictures.

## Colors

A restrained stone-and-enamel palette (marble, granite, brass) with three saturated line colours that act as wayfinding, not decoration.

### Primary
- **Line Red** (#C8202B): Dublyaj line. The spine, plaque base rules, the active dub CTA and dub tab, the train's skirt. As text use **Line Red Ink** (#B21822; dark mode #FF7880).

### Secondary
- **Line Blue** (#1D5BA8): Subtitr line and the keyboard focus ring. Text variant **Line Blue Ink** (#1A5298; dark #82B2F0).

### Tertiary
- **Line Green** (#18804A): Tahlil line only. Text variant **Line Green Ink** (#136B3D; dark #68CD96).

### Neutral
- **Marble Ground** (#F1EEE8; dark Night Ground #121214): page wall.
- **Marble Surface** (#FBFAF7; dark #1C1C1F): form panel, inputs, table body.
- **Granite Ink** (#1B1B1D; dark #F1EEE8): text and ink buttons.
- **Granite Muted** (#54514C; dark #B9B4AA): secondary text, labels (≥6.8:1 on ground).
- **Joint Rule** (#D6D0C4; dark #3A3A40): 2px borders and dividers, disabled fill.
- **Plaque Granite** (#1F1F22; dark #28282D) with **Plaque Ink** (#F4F1EB): header bar, plaques, boards, footer.
- **Brass** (#A98648): 1px hairline outline on framed boards and pictures only (2.9:1 — never text).

### Named Rules
**The One Active Line Rule.** At most one line colour is filled at a time (the selected service). Other services appear as a coloured dot beside ink or ghost controls.

**The Meaning-Only Rule.** Red, blue and green never decorate. Generic actions (pay, open bot, sign up) are ink.

## Typography

**Display / Sign Font:** Barlow Condensed 600–800 (self-hosted via next/font)
**Body Font:** Barlow 400–700 (self-hosted via next/font)

**Character:** Wayfinding caps for what you scan, a plain grotesk for what you read; one family, two widths.

### Hierarchy
- **Display** (800, clamp 3.25rem → 5.25rem, lh 0.9, uppercase): the hero plaque only.
- **Headline** (800, 1.875rem → 3rem, lh 1.02, uppercase): section stops on the spine, pricing titles.
- **Title** (800, 1.5rem, uppercase): station names, plan names, line names.
- **Body** (400, 1rem–1.25rem, lh 1.6, max 60–70ch): descriptions and leads.
- **Label** (700, 0.875rem, 0.06em tracking, uppercase): field labels, board labels.
- Numbers on boards and prices use tabular numerals (`.m-num`).

### Named Rules
**The Signage Rule.** Condensed caps only for names and headings; never set a sentence of body copy in caps.

## Layout

Max width 1280px (`max-w-7xl`), gutters 16 / 24 / 32px. Homepage first viewport: 12-column grid, plaque + lead + line map + sample frame in 5 columns, the real form ("ticket machine") in 7; below 1024px everything stacks in reading order plaque → lead → line → form. Long pages hang on the **Spine**: a 8px red vertical line at the left gutter, each section a stop with a 30px ring marker; stops are 96px apart (128px from 640px). Pricing compares plans in one table on desktop and as plaque-headed row lists on mobile. Body measure 60–70ch.

## Elevation & Depth

Flat by default. Depth comes from material: granite plaques against marble, 2px joint borders, and a 1px brass hairline (`outline-offset: 2px`) on framed boards. The only shadows are small and functional: the train (`drop-shadow 0 3px 4px rgb(0 0 0/.25)`), the floating feedback button and menus (`0 12px 32px rgb(0 0 0/.18)`).

### Named Rules
**The Flat Wall Rule.** No glass, no blur, no glow; a surface earns depth only by being a different material.

## Shapes

Plates are 6px; small controls and tags 3–4px; station markers are full circles with a 5–6px ring. Section boundaries are straight 2px rules or 6px ink segments, never rounded cards nested in cards.

## Components

### Buttons
- **Shape:** 6px plate, min height 48px (56px beside the URL field), condensed uppercase label with 0.04em tracking.
- **Ink (default):** granite fill, white text — generic actions (pay, sign up, buy, open bot).
- **Line:** red / blue / green fill — only the active service's start action.
- **Ghost:** transparent with a 2px joint ring; ring darkens to ink on hover.
- **States:** hover = brightness 0.9; pressed = 1px down; disabled = joint-rule fill + muted text + not-allowed cursor; loading = spinner + verb ("Yaratilmoqda...").

### Inputs / Fields
- **Style:** marble surface, 2px joint border, 6px radius, 56px tall for the URL gate.
- **Focus:** border turns ink; global focus-visible ring is 2px Line Blue with 2px offset.
- **Error:** message in a red-ink line inside a 2px red/50 bordered plate with `role="alert"`; field gets `aria-invalid`.

### Navigation
- **Header:** sticky granite bar, logo (light variant), line links with coloured dots (≥1024px), Ommaviy videolar / Tariflar / Donat, Kirish button in plaque-ink, theme toggle and menu as 40px ringed squares. Below 768px a "Menyu" disclosure holds the links.
- **Footer:** granite exit board with a 10px red top rule, column titles in label caps, 44px social squares, payment logos on white tiles.

### Line Map (signature)
Five stations on a line in the selected service's colour, an authored SVG train above it. On load the train runs once to Tayyor; when a link is entered it returns to Havola; while a job runs it stops at the job's real stage (`stationForStatus`). `prefers-reduced-motion` shows it already stopped.

### Station Board
Granite plaque with label/value rows, tabular numerals, a red base rule and a dated footnote. Only real, dated numbers.

### Spine Stop
Section on the spine: 30px ring marker, condensed headline, content indented 56–64px. The last stop on a page uses a filled marker (terminus).

## Do's and Don'ts

### Do:
- **Do** put long pages on the Spine and give each section a stop.
- **Do** keep text contrast ≥4.5:1 by using the `*-ink` variants for coloured text.
- **Do** date every statistic ("24.10.2026 holatiga") and source it from production data.
- **Do** keep the real action (URL field + start) inside the first viewport on every width.

### Don't:
- **Don't** fill more than one line colour at a time, or use line colours for generic actions.
- **Don't** use gradients, glass, blur, glows or neon on any surface.
- **Don't** put a small label above a heading (no eyebrows/kickers), and don't number sections unless the order itself is information.
- **Don't** set brass as text, or add a second typeface.
- **Don't** interrupt the first viewport with a modal; offers go in a dismissible inline strip.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Confirmed by the owner (2026-10-24), all four are real audiences:

- Students and learners who want foreign-language educational video (courses, lectures, popular science) in Uzbek.
- Bloggers and content creators who dub foreign videos into Uzbek for their own channels.
- Everyday viewers who want to watch an interesting YouTube video without knowing its language.
- Companies and teams translating internal training or marketing video.

The common job: "I have a video in a language I (or my audience) don't understand; give it back to me in Uzbek, fast."

## Product Purpose

GapirAI.uz turns a YouTube link or an uploaded video file into Uzbek: a full AI voice-over (dubbing, MP4), Uzbek subtitles (.srt / .vtt) without voice-over, or a study analysis (summary, key points, chapters, notes, quiz). Success: a visitor pastes a link and gets a watchable Uzbek video in minutes, without installing anything.

## Positioning

An Uzbek-first AI dubbing service: the whole flow (speech recognition, translation into natural Uzbek, Uzbek synthetic voice matched to the speaker's gender, merge back into the video) runs in the browser or in Telegram, paid in local currency through local payment rails.

## Operating Context

- Entry points: website (gapirai.uz), Telegram bot (@gapirai_uz_bot, also accepts video files), Telegram Mini App, installable PWA.
- Typical flow: paste a YouTube link (or upload a file) → choose mode (dub / subtitles / analysis) and voice (auto, male, female) → job runs in a queue with live progress → watch, download MP4/subtitles, regenerate.
- Admin can publish finished dubs to the public library at /videos.

## Capabilities and Constraints

- Plans (source of truth `backend/services/plans.py`, never invent prices): Bepul 0 so'm, 5 min/month, 360p; Standart 49 000 so'm/month, 350 min, 720p, priority queue; Pro 199 000 so'm/month, 600 min, 1080p, priority; yearly variants 490 000 and 1 990 000 so'm. One-off minute packs (from 15 min for 4 900 so'm) never expire. Subtitle jobs spend the same minute quota as dubbing.
- Max 120 minutes per video. Payments: Click, Payme, Uzum, Paynet.
- Voices: automatic gender detection, or male/female; Pro users can pick voice variants.
- Content policy: no religious, 18+, violent or illegal content.
- Copy is Uzbek (Latin). Code identifiers English.

## Brand Commitments

- The GapirAI.uz logo (`frontend/public/logo.webp`, `logodark.webp`) is kept. Colours, type and visual style are open to replacement (owner, 2026-10-24).

## Evidence on Hand

Owner approved using (2026-10-24):

- Real platform statistics from the production database (e.g. number of finished dubs, total dubbed minutes) — must be pulled live or from a dated snapshot, never estimated.
- Finished dubs from the public library (/videos) as demonstrations.
- Real user feedback from the Telegram channel, with permission. None is collected in the repo yet; do not fabricate quotes.

Absent: customer logos, certifications, partnerships, benchmarks, press. Do not invent them.

## Product Principles

1. Show the video in Uzbek, not adjectives about AI.
2. The first action is the real one: paste a link.
3. Every number on the page is a real one.
4. Plain, natural Uzbek; no hype.

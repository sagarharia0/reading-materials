# Session: Full pipeline build — processors, digest, highlights, email ingestion
**Date:** 2026-04-06 to 2026-04-07
**Duration focus:** Building the entire content pipeline end-to-end, from Firebase setup through to a deployed, functional app

## Starting point
Empty project directory with only CLAUDE.md. No code, no Firebase project, no git repo.

## What we did

### Infrastructure setup (2026-04-06)
- Initialised git repo, created GitHub account `sagarharia0`, pushed to `sagarharia0/reading-materials`
- Created Firebase project `reading-materials-60e09` (Firestore in nam5, Blaze plan)
- `firebase init` with Firestore + Functions (TypeScript) + Hosting
- Python venv with yt-dlp, trafilatura, readability-lxml, openai-whisper
- Installed openjdk for Firebase emulators
- Fixed git author from work account (sagarharia-dialpad) to personal (sagarharia0) via filter-branch

### Core pipeline
- `functions/src/types.ts` — ContentDocument, ExtractedContent, AiEnrichment, DigestDocument, DigestItem types. Later added ExtractionMeta and ExtractionConfidence.
- `functions/src/resolver.ts` — URL pattern detection (YouTube, Substack, podcast, Twitter, GitHub, PDF, article fallback). Added arxiv.org/pdf/ pattern.
- `functions/src/processors/article.ts` — article extraction via @extractus/article-extractor with HTML stripping
- `functions/src/processors/youtube.ts` — transcript via InnerTube API + web page fallback. Removed `youtube-transcript` npm package (ESM incompatible with Cloud Functions CJS).
- `functions/src/processors/github.ts` — README + repo metadata via GitHub API
- `functions/src/processors/pdf.ts` — pdf-parse v1.1.1 (v2 had breaking API changes, unpdf had type issues)
- `functions/src/processors/twitter.ts` — tweet via oEmbed API (unreliable)
- `functions/src/processors/substack.ts` — uses article-extractor with paywall detection (<200 chars = likely paywalled)
- `functions/src/processors/podcast.ts` — audio URL detection from page HTML, Deepgram Nova-3 transcription
- `functions/src/ai/summarise.ts` — Claude Sonnet for summary, tags, deeperScore (1-5). Prompt covers AI model landscape across providers.
- `functions/src/processUrl.ts` — orchestrator: queues doc first (never lose content), extracts, summarises, updates. Handles email content path (email:// scheme).
- `functions/src/index.ts` — processUrl HTTP endpoint with secrets (ANTHROPIC_API_KEY, DEEPGRAM_API_KEY)

### Daily digest
- `functions/src/ai/digest.ts` — Claude generates themed digest from item summaries. Tone instruction: "like a sharp colleague giving a quick briefing, no hype."
- `functions/src/generateDigest.ts` — reads new + unread items, generates HTML/text, stores in `digests` collection, marks items as `digest_included`, sends email via Brevo. Links headlines to item detail view + source URLs.
- `scheduledDigest` — runs daily at 6pm UK time
- `generateDigest` — manual HTTP trigger
- Digest view in frontend loads from `digests` collection, falls back to today's raw items if no digest exists

### Highlighting + learning profile
- Firestore `highlights` collection: contentId, highlightedText, surroundingContext, section, createdAt
- Selection detection via selectionchange + mouseup + touchend (Android compatibility)
- `pendingHighlight` pattern: capture selection data before save button click clears it. mousedown on save button calls preventDefault to preserve selection.
- Saved highlights re-rendered as `<mark>` elements when returning to an item
- Highlights view with by-article grouping + delete capability
- `functions/src/ai/learningProfile.ts` — analyses highlights, produces interests (with evidence counts), knowledge gaps, patterns
- `functions/src/generateLearningProfile.ts` — min 5 highlights required
- Learning profile feeds into digest generation as optional context
- By-theme tab shows profile with regenerate button

### RSS feed scheduler
- `functions/src/scheduledIngest.ts` — checks feeds collection every 6 hours, deduplicates by sourceUrl, processes new items through full pipeline
- `feeds` Firestore collection with url, name, lastChecked
- Frontend: feed management in "add" view (add/remove feeds)
- `checkFeeds` HTTP endpoint for manual triggering

### Email ingestion
- Gmail Apps Script: checks `reading-materials` label every 15 minutes
- Tries "view in browser" link first (better extraction), falls back to email body text
- Processed emails moved to `reading-materials/done` sub-label
- processUrl updated to accept `emailContent` payload with subject/from/body
- Fixed: Firestore rejects undefined values — extractionMeta set to null when absent

### Frontend
- Terminal-style UI (JetBrains Mono, dark theme, `$ ` prompt headers)
- Views: digest, library, add, highlights, item detail
- PWA with manifest.json, service worker, Android share target
- Expandable full text in item detail view
- Card arrows (↗) indicating clickable items
- Email items show "via email" instead of "open source" button
- Hosting rewrites: /api/processUrl, /api/generateDigest, /api/updateLearningProfile

### Deployment
- Deployed to Firebase: reading-materials-60e09.web.app
- Secrets: ANTHROPIC_API_KEY, BREVO_API_KEY, DEEPGRAM_API_KEY
- Git author fixed to sagarharia0/sagar.haria@gmail.com (repo-local config)

## Decisions made

- **goDeeper moved to backlog.** User flagged hallucination risk on new content. Learning profile + digest + highlights already cover "tie things together" need. Button removed from UI.
- **Deepgram over Whisper for podcasts.** Whisper can't run in Cloud Functions (too heavy, needs GPU). Deepgram has $200 free credit (~700 hours).
- **Gmail + Apps Script over Mailgun/Cloudflare for email.** No new infrastructure needed, user already has Gmail. 10-15 min polling delay is fine for newsletters. Script runs inside Google's infrastructure.
- **Firestore direct writes for highlights** (not via Cloud Function). Near-instant save UX on mobile. Personal tool, no auth needed.
- **pdf-parse v1.1.1** specifically — v2 has incompatible API, unpdf has nodenext type issues.
- **youtube-transcript npm package removed** — ESM-only, incompatible with Cloud Functions' CJS compilation. Replaced with direct InnerTube API + web page scraping.
- **pendingHighlight pattern** for mobile highlighting — browser clears selection when you tap a button, so selection data must be captured beforehand.
- **Summarisation prompt broadened** to cover AI model landscape across OpenAI, Anthropic, Google, xAI, DeepSeek, Meta, Mistral. deeperScore calibrated with specific 1-5 criteria.
- **Digest tone: plain and human.** No "fascinating juxtaposition" or "groundbreaking". Like a sharp colleague briefing you.
- **Service worker cache versioning** — bumped on every deploy to force PWA updates. Currently at v7.

## Problems encountered

- **article-extractor 404s on some sites** (Simon Willison, BBC) — user-agent blocking. Most sites work. Acceptable for MVP.
- **Firebase emulator data loss on restart** — expected behaviour, not a bug. Production Firestore persists.
- **ESM/CJS conflict** with youtube-transcript — rewrote YouTube processor without the package.
- **Highlighting "no text selected" bug** — clicking save button cleared browser selection before handler could read it. Fixed with pendingHighlight + mousedown preventDefault.
- **Firestore rejects undefined** — extractionMeta was undefined for email items. Fixed by conditionally including the field.
- **Firebase deploy "unexpected error"** — transient; debug logs showed it actually deployed successfully.

## Current state

**Working:**
- Full URL processing pipeline (article, YouTube, GitHub, PDF, Substack, Twitter, podcast)
- Daily digest generation at 6pm UK + manual trigger
- Highlighting with save bar, persistence, and highlights view
- Learning profile generation (needs 5+ highlights)
- RSS feed scheduling (every 6 hours)
- Gmail email ingestion via Apps Script (every 15 min)
- PWA with Android share target
- Live at reading-materials-60e09.web.app

**Untested:**
- Brevo email digest delivery (code written, key set, should fire at next 6pm digest)
- Android PWA share target (deployed but not tested on device)
- Podcast processor end-to-end with a real podcast URL

**Known limitations:**
- Twitter oEmbed API is unreliable
- Some sites block article-extractor (no headless browser)
- Highlighting only works in item detail view (not on digest page)
- By-theme highlights view needs a learning profile to be generated first

## Next steps

1. **Test Brevo email delivery** — trigger a digest and check if email arrives
2. **Test Android PWA share target** — install PWA on phone, share a URL into it
3. **Test podcast processor** — try with a real podcast episode URL
4. **Reddit processor** — Reddit has a public JSON API (append .json to post URL)
5. **Highlighting on digest page** — would need to map digest text back to content document IDs
6. **Consider auth** — currently open to anyone with the URL. Fine for personal use but worth revisiting.

## Open questions

- Should the Gmail Apps Script be in the repo (for version control) or is it fine living only in script.google.com?
- Is the 6-hour RSS check frequency right, or should it be more/less frequent?
- Should failed items be auto-retried, or is manual re-labelling / re-submission sufficient?

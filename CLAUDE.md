# AI Learning Pipeline

## What This Project Is
A personal AI-powered content ingestion and learning system. It monitors multiple content sources (YouTube, Substacks, podcasts, articles, social media), processes and normalises them into a unified format, generates daily digests, and enables "go deeper" exploration of interesting topics.

The owner is a Head of Product who is building AI literacy and wants to stay current on AI developments, agent frameworks, and applied AI — particularly as it relates to product management and building with tools like Claude Code.

## Tech Stack
- **Backend/Hosting**: Firebase (Firestore, Cloud Functions, Hosting)
- **Processing scripts**: Python 3.11+
- **Frontend**: HTML/JS hosted on Firebase Hosting (mobile-friendly reader UI)
- **Repo**: GitHub (public, intended as a portfolio piece)

## Architecture

### Content Sources
- YouTube videos → transcript extraction via yt-dlp
- Substack newsletters → article extraction via trafilatura
- Podcasts → RSS feed monitoring, audio transcription via Whisper
- Web articles/blogs → article extraction via trafilatura/readability
- Twitter/X threads → manual paste or Nitter extraction
- GitHub repos → README/content extraction
- PDFs → text extraction + OCR fallback

### URL Resolver
Every URL submitted goes through a resolver that:
1. Detects source type from URL pattern
2. Routes to the correct processor
3. Outputs a normalised document to Firestore

### Normalised Document Schema (Firestore)
```
{
  id: string (auto-generated),
  title: string,
  sourceUrl: string,
  sourceType: "youtube" | "substack" | "podcast" | "article" | "twitter" | "github" | "pdf" | "other",
  dateAdded: timestamp,
  datePublished: timestamp | null,
  summary: string (AI-generated, 2-3 sentences),
  tags: string[] (AI-generated),
  fullText: string (extracted content),
  status: "queued" | "processed" | "digest_included" | "deep_dive_done" | "failed",
  deeperScore: number (1-5, AI-rated relevance),
  notes: string (user's personal notes),
  deepDive: string | null (expanded analysis when requested)
}
```

### Cloud Functions
- **processUrl**: HTTP trigger — accepts a URL, runs the resolver, writes to Firestore
- **scheduledIngest**: Scheduled — checks RSS feeds and monitored sources for new content
- **generateDigest**: Scheduled (daily) — reads unprocessed items, generates a digest document
- **goDeeper**: HTTP trigger — takes a document ID, generates expanded analysis

### Frontend
- Mobile-first reader UI hosted on Firebase Hosting
- Views: daily digest, content library (filterable/searchable), single item deep-dive
- Simple URL input form for adding new content
- Star/bookmark functionality for items to revisit

## Project Structure
```
/
├── CLAUDE.md
├── README.md
├── functions/           # Firebase Cloud Functions (Node.js)
│   ├── package.json
│   ├── src/
│   │   ├── index.ts     # Function entry points
│   │   ├── resolver.ts  # URL detection and routing
│   │   ├── processors/  # Source-specific processors
│   │   │   ├── youtube.ts
│   │   │   ├── substack.ts
│   │   │   ├── podcast.ts
│   │   │   ├── article.ts
│   │   │   ├── twitter.ts
│   │   │   └── github.ts
│   │   ├── ai/          # Claude API integration
│   │   │   ├── summarise.ts
│   │   │   ├── digest.ts
│   │   │   └── deepDive.ts
│   │   └── utils/
├── processing/          # Python processing scripts (called by Cloud Functions)
│   ├── requirements.txt
│   ├── extract_transcript.py
│   ├── extract_article.py
│   └── transcribe_audio.py
├── public/              # Firebase Hosting - frontend
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── assets/
├── firebase.json
├── firestore.rules
└── .github/
    └── workflows/       # CI/CD if needed
```

## Key Design Decisions
- Process everything into the same normalised shape so downstream features (digest, search, deep-dive) are source-agnostic
- "Go deeper" is on-demand, not automatic — saves API costs and lets the user direct attention
- Frontend is deliberately simple — this is a reading/learning tool, not a social app
- Failed processing should never silently drop content — always store with "failed" status for manual review

## Commands
- `firebase deploy --only functions` — deploy cloud functions
- `firebase deploy --only hosting` — deploy frontend
- `firebase emulators:start` — local development
- `firebase functions:shell` — test functions locally

## Session Management
If this conversation has involved significant progress (multiple features built, major decisions made, or tricky problems solved), proactively suggest running `/save-session` before wrapping up. Session logs live in `sessions/` and preserve the reasoning and context that code alone doesn't capture. Don't wait to be asked — nudge the user when it would be valuable.

## Current Status
[Update this as you build]
- [x] Firebase project initialised
- [ ] URL resolver and processors
- [ ] Firestore schema and rules
- [ ] processUrl Cloud Function
- [ ] scheduledIngest Cloud Function
- [ ] generateDigest Cloud Function
- [ ] goDeeper Cloud Function
- [ ] Frontend reader UI
- [ ] iOS Shortcut for quick URL submission
- [ ] GitHub README and documentation

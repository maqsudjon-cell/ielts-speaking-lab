# IELTS Speaking Lab — AI Examiner 🎙🪬

**Live: https://ielts-speaking-lab.pages.dev** (Cloudflare Pages)
API proxy: `https://ielts-examiner.maqsudjon-polatov.workers.dev` (already set as the app default — students need zero setup)

Browser-based IELTS Speaking practice with an AI examiner. Two modes:

- **Voice Mode** — camera-free voice chat with the examiner (like a voice call).
- **AR Examiner** — camera on, futuristic HUD, hand-gesture controls.

Question bank: **Maqsudjon's Jan–Apr 2026 list** — 41 Part 1 topics, 63 Part 2 cue cards, 62 Part 3 sets (from the PDF, parsed into `questions.js`).

## Features

- AI examiner (Gemini) asks Part 1 / 2 / 3 questions one at a time, listens, and follows up
- Part 2 flow with a 1-minute preparation countdown
- Band-score feedback (Fluency, Lexical Resource, Grammar + top-3 improvements)
- Natural Gemini voice (browser voice as free fallback)
- Hand gestures in AR mode (MediaPipe): 👌 pinch = tap, pinch-drag = scroll, 🖐 palm = open/close questions, ✊ fist = stop
- 📸 photo, 🎥 video, ⏺ audio recording — saved to the device
- Add / remove topics (stored in the browser, `localStorage`)
- Search across all topics and questions

## Files

| File | Purpose |
|---|---|
| `index.html` | UI (all styles inline) |
| `app.js` | App logic: session, STT/TTS, Gemini client, gestures, recording |
| `questions.js` | Question bank (generated from the PDF) |
| `worker.js` | Cloudflare Worker — hides the Gemini API key, adds a daily cap |

## Deployed setup (already done)

- **Worker**: `ielts-examiner` on Cloudflare, secret `GEMINI_API_KEY` set, KV namespace `USAGE` bound (daily cap 400 req/IP). Redeploy after edits with `npx wrangler deploy`.
- **Site**: Cloudflare Pages project `ielts-speaking-lab`. Redeploy with:
  ```sh
  npx wrangler pages deploy <folder-with-index.html> --project-name ielts-speaking-lab --branch main
  ```
  (GitHub Pages for this repo kept failing with stuck deployments, so hosting moved to Cloudflare Pages.)
- The app's default Worker URL is set in `app.js` (`DEFAULT_WORKER`); users can override it in ⚙ Settings (stored in localStorage), or paste a raw API key for personal testing.

## Notes / limits

- **Speech recognition** uses the browser's Web Speech API — works best in **Chrome** (desktop & Android). iOS Safari support is partial.
- Camera/mic require **HTTPS** (GitHub Pages is fine) or `localhost`.
- Gemini free tier is enough for practice sessions; the Worker's daily cap protects the shared key.

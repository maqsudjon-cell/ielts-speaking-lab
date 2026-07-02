# IELTS Speaking Lab — AI Examiner 🎙🪬

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

## Setup

### 1. Get a free Gemini API key
https://aistudio.google.com/apikey

### 2. Deploy the Worker (recommended — keeps the key hidden)
1. https://dash.cloudflare.com → **Workers & Pages → Create Worker**
2. Paste `worker.js`, **Deploy**
3. Worker → **Settings → Variables and Secrets** → add secret `GEMINI_API_KEY`
4. *(Optional)* bind a KV namespace named `USAGE` to enable the per-IP daily limit
5. Copy the worker URL (e.g. `https://ielts-examiner.xxx.workers.dev`)

### 3. Configure the app
Open the site → ⚙ **Settings** → paste the **Worker URL** → Save.
(Or paste a raw API key instead — fine for personal testing, don't publish it.)

## Notes / limits

- **Speech recognition** uses the browser's Web Speech API — works best in **Chrome** (desktop & Android). iOS Safari support is partial.
- Camera/mic require **HTTPS** (GitHub Pages is fine) or `localhost`.
- Gemini free tier is enough for practice sessions; the Worker's daily cap protects the shared key.

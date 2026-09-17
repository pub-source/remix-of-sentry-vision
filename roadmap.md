# MSDS roadmap

## In progress
- [x] Massive Tagalog + English safety/awareness phrase library used for transcription recognition (`src/lib/safetyLexicon.ts`)
- [x] Stop Monitoring disconnects CAM 1–4 on the local service
- [ ] Live CCTV transcript: replace (never merge/accumulate), auto-clear after 5 s, timer restarts on each new transcript (`useCctvSpeech.ts`, `useCameraPipeline.ts`)

## Standing rules (handoff spec)
- Keep real RTSP/MediaMTX/FFmpeg/Whisper/Electron/GPU logic — no mocks.
- CCTV mic is the transcription source; browser mic only push-to-talk/fallback.
- Full Whisper sentence shown; safety keyword kept separate from the transcript.
- No new external email system; in-app notifications are the priority.
- HashRouter for Electron; don't require all 4 cameras connected.

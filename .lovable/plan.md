
# Big Pass: Landing + Auth + Fonts + ML Feedback + Data Admin + Expert Mode

Honest scope note up front: **"+/- 1% failure rate"** on fire, facial distress, and audio isn't physically achievable with browser-side pretrained models (face-api FER, YAMNet, color+flicker fire). What I *can* build — and will — is a per-household feedback loop that records every 👍/👎, aggregates it, and **auto-tunes confidence thresholds** so the system gets progressively fewer false alarms in *your* environment. That's the real-world "keeps learning after deploy" behavior you want.

---

## 1. Landing page (real security-company feel)
- Restore `/` → `Landing` (currently redirects to `/auth`).
- Rebuild `Landing.tsx` as a corporate-thesis hybrid: dark navy + cyan HUD accents (matches dashboard), Space Grotesk headings + Inter body.
- Sections: sticky nav, hero with animated camera-grid + live "AI STATUS" ticker, "How it protects your family" (fire / distress / audio triad), "The Science" (thesis credibility — datasets, architecture, accuracy caveats), live demo CTA, testimonials-style trust bar, footer.
- CTAs → `/auth` (Sign in) and `/dashboard` (Try live demo).

## 2. Elder-friendly typography (+1 step site-wide)
- Add root `font-size: 18px` in `index.css` so all `rem`-based UI scales up.
- Override Tailwind text-scale in `tailwind.config.ts`: `xs→14`, `sm→16`, `base→18`, `lg→20`, `xl→24`, `2xl→30`, `3xl→36`.
- Increase min-tap-target to 44px on buttons/inputs via a utility class.

## 3. Auth page fixes
- Bigger card (`max-w-md → max-w-lg`), larger inputs (`h-12 text-lg`), larger labels.
- **Remove all password strength requirements** — only "min 6 chars" enforced by Supabase.
- **Fix Create Account button**: the current handler doesn't clear form errors or handle "user already registered" gracefully. Rewrite to: show inline success toast, auto-switch to sign-in tab on success, surface real error text.
- Keep Google sign-in and forgot-password link.

## 4. Database fixes + Data Admin hub
- Audit RLS/GRANTs on: `detection_feedback`, `detection_sessions`, `detection_data`, `detected_objects_log`, `alert_history`. Add missing `service_role` grants and any missing user-scoped policies.
- Add `admin` role via `app_role` enum + `user_roles` table + `has_role()` security-definer function (per project rules — never store roles on profiles).
- New `/admin` page (visible only to admins):
  - **Users** tab — auth users + household membership
  - **Sessions** tab — detection sessions with duration, event counts
  - **Labeled data** tab — every `detection_feedback` row, filterable by event type and label
  - **ML export** tab — one-click JSON + CSV download of labeled corpus (fire, facial_distress, audio_scream, etc.), ready to feed a training script

## 5. ML feedback loop on all three detectors
- Extend `DetectionFeedback` widget usage:
  - **Fire panel** (already receives it partially) — attach to each fire alert with `event_type: 'fire' | 'smoke_emergency'`, include `firePixelRatio`, `flickerScore`, `smokeRatio`, `visibility` in `visual_context`.
  - **Facial distress** — new inline widget on FusedDetectionView showing "Was this crying / distress correct?" with sub-labels: `crying`, `scream`, `fall`, `neutral_false_alarm`.
  - **YAMNet audio** — feedback on every scream/crying/glass-break classification with the top-3 YAMNet class scores stored.
- New table column additions (via migration) if needed: `sub_label text`, `raw_scores jsonb`.
- **Auto-tune loop**: new `useAdaptiveThresholds(householdId)` hook reads recent feedback aggregates and returns per-detector confidence multipliers (e.g. if a household has 20 false-positive fires at flicker<0.00001, raise `MIN_FLICKER` locally). Applied at decision time in `fireDetection.ts`, `useFaceDistress`, and YAMNet consumer.

## 6. Expert Mode + pixel-dog mascot + hologram diagram
- New route `/expert` with sections for each algorithm: **Fire pipeline**, **Facial distress (FER→distress score)**, **YAMNet audio**, **Object detection (COCO-SSD)**, **Saliency**, **Fusion & adaptive thresholds**.
- Generate pixel-art shiba mascot sprite (idle + talking frames) via imagegen; render as animated `<img>` with speech bubbles walking through each function.
- Speech bubbles cite the actual functions (`detectFire`, `useFaceDistress.analyze`, etc.) with 1–2 sentence plain-language explanations + collapsible "show code" snippet.
- **Hologram diagram**: clicking any algorithm opens a full-screen overlay with an animated SVG diagram — cyan glow, scanlines, rotating pipeline nodes (Input → Model → Post-process → Fusion → Alert), Framer Motion transitions. Not real WebGL holography; a stylized SVG/CSS effect that reads as "hologram" (bloom, chromatic aberration, animated grid floor).

## Technical details (non-user)
- Tailwind fontSize override in `tailwind.config.ts theme.extend.fontSize`.
- Migration order per rules: CREATE TABLE → GRANT → ALTER ENABLE RLS → CREATE POLICY. New tables: `user_roles`, enum `app_role`, function `has_role`. Alter `detection_feedback` to add `sub_label`, `raw_scores`.
- Hologram overlay = React portal + Framer Motion + inline SVG; no new deps.
- Mascot uses one generated PNG sprite sheet, animated by swapping frames with `setInterval` (no runtime cost when route not mounted).
- Adaptive thresholds: cache in `sessionStorage`, refetched every 60s.

## Out of scope / honesty
- No true model re-training in the browser (physically impossible). The dataset export from the Admin hub is the handoff point for offline fine-tuning.
- Cannot guarantee "±1% failure rate" — Expert Mode page will state actual realistic accuracy ranges per detector and how the adaptive-threshold loop reduces *your* false-alarm rate over time.

## Sequencing (all in one pass, in this order so preview stays usable)
1. Migration (roles + feedback columns + grants)
2. Tailwind + index.css typography bump
3. Landing rebuild + route restore
4. Auth page redesign + Create Account fix
5. Feedback widgets wired into fire / face / audio + adaptive thresholds hook
6. `/admin` data hub
7. Mascot generation + `/expert` route + hologram overlay

Approve and I'll execute end-to-end.

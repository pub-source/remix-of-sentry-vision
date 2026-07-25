## Goals

1. **OBS / source-per-view**: CAM 1 (raw) and CAM 2 (fused detection) can point at different cameras. When OBS Virtual Camera is picked as CAM 2's source, all fused detection (object bboxes, distress, activity inference, fire, face) runs on the OBS frame — not the raw webcam.
2. **Transcript auto-expiry**: Final transcript segments vanish after ~3s so stale words can't re-trigger wake-word / distress alerts.
3. **Strip all emojis / emoticons** from alerts, overlays, and labels.
4. **Remove "Speaking (no visual subject)"** fallback activity string.

## Changes

### Source selection (OBS)
- `src/hooks/useCamera.ts`: OBS Virtual Camera already appears in `enumerateDevices()` as a `videoinput`. Confirm `startSpecificCamera(deviceId, slot, quality)` accepts it (no code change beyond ensuring slot 2 is targetable).
- `src/pages/Index.tsx`:
  - Add a per-slot picker in the existing Connect dialog: "CAM 1 source" and "CAM 2 (Fused) source", each listing detected devices (including OBS) plus the IP-cam option.
  - `ipTargetSlot` already routes IP streams to a slot; extend the picker to send OBS/webcam to slot 2 independently of slot 1.
  - Ensure `cam2SourceCanvas` (captured from CAM 2's `CameraFeed`) is the frame passed to: object detection, `FusedDetectionView`, `useFaceDistress.analyze`, and `detectFire`. Currently fire/objects run off `sourceCanvas` (CAM 1). Switch fused pipelines to prefer `cam2SourceCanvas` and fall back to `sourceCanvas` only when slot 2 is empty.
  - `handleObjectsUpdate`, fusion score, and fire `useEffect` updated to key off `cameras[1]` when CAM 2 is active.

### Transcript auto-vanish
- `src/hooks/useSpeechRecognition.ts`:
  - On each final result, append with a timestamp and schedule a 3s `setTimeout` that removes it from `transcript`.
  - Also clear `interimTranscript` if no new events arrive within ~1.5s.
- `src/pages/Index.tsx` wake-word effect: dedupe window stays 5s; because transcript now self-clears, no stale re-trigger.

### Remove emojis
- `src/components/dashboard/FusedDetectionView.tsx`: strip icons from activity string (`⚠`, `🎯`, `💬`) and from distress labels. Replace with plain text (`ALERT`, `DISTRESS:`, `Speech:`).
- `src/pages/Index.tsx`: strip `🔊`, `🔥`, `💨`, `😟` from `addAlert(...)` calls.
- Any other alert/log strings audited for emoji/emoticons.

### Remove "Speaking (no visual subject)"
- `src/components/dashboard/FusedDetectionView.tsx` `inferDistress`: delete the `!hasPerson && audioFeatures.speechDetected` branch. Fall through to the normal "no activity / object list" path.

## Notes for user

- OBS support requires **OBS Virtual Camera** to be started in OBS. The browser then sees it like any webcam and lists it in the CAM 2 source picker.
- No UI layout/redesign; only the Connect dialog gains a slot selector and text is de-emojified.

const phraseKey = (value: string) => value
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}']+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');

/** Merge a new CCTV transcript without repeating overlapping Whisper chunks. */
export function mergeTranscript(current: string, incoming: string, maxLength = 600): string {
  const next = incoming.trim();
  if (!next) return current;

  const currentKey = phraseKey(current);
  const nextKey = phraseKey(next);
  if (!nextKey || currentKey === nextKey || currentKey.endsWith(nextKey)) return current;

  const currentWords = current.trim().split(/\s+/).filter(Boolean);
  const nextWords = next.split(/\s+/).filter(Boolean);
  const maxOverlap = Math.min(currentWords.length, nextWords.length, 24);
  let overlap = 0;
  for (let size = maxOverlap; size > 0; size -= 1) {
    const tail = phraseKey(currentWords.slice(-size).join(' '));
    const head = phraseKey(nextWords.slice(0, size).join(' '));
    if (tail && tail === head) {
      overlap = size;
      break;
    }
  }

  return `${current.trim()} ${nextWords.slice(overlap).join(' ')}`.trim().slice(-maxLength);
}
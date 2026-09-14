import { generatedTranscriptSchema, type GeneratedTranscript } from '@aptly/contracts';
import { ProviderError } from '../provider.js';

export function invalid(ambiguous = false): never {
  throw new ProviderError('provider_invalid_response', ambiguous);
}
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
export function string(value: unknown, max = 1024): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return invalid();
  return value;
}
export function httpsUrl(value: unknown): string {
  const raw = string(value, 16384);
  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.hash ||
      raw.includes('#') ||
      raw.trim() !== raw
    )
      return invalid();
  } catch {
    return invalid();
  }
  return raw;
}
function seconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return invalid();
  return value;
}
function optionalLabel(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  return string(value, max);
}

export function normalizeTranscript(raw: unknown): GeneratedTranscript {
  const data = object(raw);
  if (typeof data.text !== 'string') return invalid();
  const durationSeconds = seconds(data.duration);
  const rows = data.results ?? data.segments;
  if (!Array.isArray(rows) || rows.length > 100000) return invalid();
  let lastStart = 0;
  const segments = rows.map((rawSegment) => {
    const segment = object(rawSegment);
    const startSeconds = seconds(segment.start);
    const endSeconds = seconds(segment.end);
    if (
      startSeconds < lastStart ||
      endSeconds < startSeconds ||
      endSeconds > durationSeconds ||
      typeof segment.text !== 'string'
    )
      return invalid();
    lastStart = startSeconds;
    const rawSpeaker = segment.speaker_id ?? segment.speaker;
    const speakerId =
      typeof rawSpeaker === 'number'
        ? Number.isSafeInteger(rawSpeaker) && rawSpeaker >= 0
          ? String(rawSpeaker)
          : invalid()
        : optionalLabel(rawSpeaker, 200);
    const language = optionalLabel(segment.language, 64);
    return {
      startSeconds,
      endSeconds,
      text: segment.text,
      ...(speakerId === undefined ? {} : { speakerId }),
      ...(language === undefined ? {} : { language }),
    };
  });
  const result = generatedTranscriptSchema.safeParse({
    text: data.text,
    durationSeconds,
    language: optionalLabel(data.language, 64) ?? null,
    segments,
  });
  if (!result.success) return invalid();
  return result.data;
}

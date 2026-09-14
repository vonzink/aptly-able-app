import type { TranscriptSegment } from '@aptly/contracts';

import { MAX_TRANSCRIPT_BYTES } from './recording-model';

export interface ParsedTranscript {
  text: string;
  segments: TranscriptSegment[];
}

// Counts UTF-8 bytes without relying on TextEncoder being present in a native runtime.
function utf8Size(text: string): number {
  let size = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    size += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (size > MAX_TRANSCRIPT_BYTES) break;
  }
  return size;
}

function invalid(): never {
  throw new Error(
    'This transcript has invalid or missing timestamps. Export a valid SRT or VTT file, or import plain text.',
  );
}

function timestamp(value: string, format: string): number {
  const match = (
    format === 'srt'
      ? /^(\d{2,}):(\d{2}):(\d{2}),(\d{3})$/
      : /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/
  ).exec(value);
  if (!match) return invalid();
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) return invalid();
  const result = hours * 3600 + minutes * 60 + seconds + Number(match[4]) / 1000;
  if (!Number.isFinite(result)) return invalid();
  return result;
}

function cueText(raw: string): { text: string; speakerId?: string } {
  const voice = /^<v(?:\.[^\s>]+)*\s+([^>]+)>/i.exec(raw);
  const voices = Array.from(raw.matchAll(/<v(?:\.[^\s>]+)*\s+([^>]+)>/gi));
  const multipleVoices = new Set(voices.map((match) => match[1]?.trim())).size > 1;
  const source = multipleVoices ? raw.replace(/<v(?:\.[^\s>]+)*\s+([^>]+)>/gi, '$1: ') : raw;
  const text = source
    .replace(/<\/?(?:b|i|u|c(?:\.[^\s>]+)*|v(?:\.[^\s>]+)*|lang|ruby|rt)(?:\s+[^>]*)?>/gi, '')
    .replace(/<\d{2}:\d{2}(?::\d{2})?\.\d{3}>/g, '')
    .replace(
      /&(amp|lt|gt|nbsp|lrm|rlm);/g,
      (_match, entity: string) =>
        ({ amp: '&', lt: '<', gt: '>', nbsp: ' ', lrm: '\u200e', rlm: '\u200f' })[entity]!,
    )
    .trim();
  if (!text) return invalid();
  if (multipleVoices) return { text };
  if (voice?.[1]?.trim()) return { text, speakerId: voice[1].trim() };
  const prefix = /^([\p{L}\p{N}][\p{L}\p{N} ._'’-]{0,79}):\s+([^]*)$/u.exec(text);
  if (prefix?.[1] && prefix[2]?.trim())
    return { text: prefix[2].trim(), speakerId: prefix[1].trim() };
  return { text };
}

export function parseTranscript(fileName: string, source: string): ParsedTranscript {
  const extension = fileName.split('.').at(-1)?.toLowerCase();
  if (!extension || !['txt', 'srt', 'vtt'].includes(extension))
    throw new Error('Choose a TXT, SRT, or VTT transcript.');
  if (utf8Size(source) > MAX_TRANSCRIPT_BYTES)
    throw new Error('Choose a transcript no larger than 2 MiB.');
  const normalized = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const hasBinaryControls = Array.from(normalized).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10;
  });
  if (!normalized || hasBinaryControls)
    throw new Error('The transcript is empty or is not a supported text file.');
  if (extension === 'txt') return { text: normalized, segments: [] };
  const blocks = normalized.split(/\n(?:[ \t]*\n)+/);
  if (extension === 'vtt') {
    const header = blocks.shift();
    if (!header || !/^WEBVTT(?:[ \t][^\n]*)?(?:\n[^]*)?$/.test(header) || header.includes('-->'))
      return invalid();
  }
  const segments: TranscriptSegment[] = [];
  const plain: string[] = [];
  for (const block of blocks) {
    if (extension === 'vtt' && /^(?:NOTE(?:[ \t\n]|$)|STYLE(?:\n|$)|REGION(?:\n|$))/.test(block))
      continue;
    const lines = block.split('\n');
    if (!lines[0]?.includes('-->')) {
      if (extension === 'srt' && !/^\d+$/.test(lines[0] ?? '')) return invalid();
      lines.shift();
    }
    const timing = lines.shift()?.match(/^(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+[^]*)?$/);
    if (!timing?.[1] || !timing[2] || !lines.length) return invalid();
    const startSeconds = timestamp(timing[1], extension);
    const endSeconds = timestamp(timing[2], extension);
    if (endSeconds < startSeconds) return invalid();
    const content = cueText(lines.join('\n'));
    segments.push({ startSeconds, endSeconds, ...content });
    plain.push(content.speakerId ? `${content.speakerId}: ${content.text}` : content.text);
  }
  if (!segments.length) return invalid();
  return { text: plain.join('\n\n'), segments };
}

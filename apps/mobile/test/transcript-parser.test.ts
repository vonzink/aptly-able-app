import { describe, expect, it } from 'vitest';

import { parseTranscript } from '../src/features/recordings/transcript-parser';

describe('transcript imports', () => {
  it('accepts additional blank separator lines in VTT without losing cue text', () => {
    expect(
      parseTranscript(
        'notes.vtt',
        'WEBVTT\n\n\n\n00:01.000 --> 00:02.000\nOne.\n\n\n\n00:03.000 --> 00:04.000\nTwo.\n',
      ).segments,
    ).toEqual([
      { startSeconds: 1, endSeconds: 2, text: 'One.' },
      { startSeconds: 3, endSeconds: 4, text: 'Two.' },
    ]);
  });
  it('keeps plain text without inventing timestamps or speakers', () => {
    expect(
      parseTranscript('meeting.TXT', '\uFEFFAlice: Hello.\r\nWe agreed to follow up.'),
    ).toEqual({
      text: 'Alice: Hello.\nWe agreed to follow up.',
      segments: [],
    });
  });

  it('reads SRT timestamps, multiline text and supplied speaker prefixes', () => {
    expect(
      parseTranscript(
        'meeting.srt',
        '1\n00:01:02,500 --> 00:01:05,250\nAlice: Hello.\nAnother line.\n\n2\n00:01:06,000 --> 00:01:08,000\nGoodbye.',
      ),
    ).toEqual({
      text: 'Alice: Hello.\nAnother line.\n\nGoodbye.',
      segments: [
        {
          startSeconds: 62.5,
          endSeconds: 65.25,
          text: 'Hello.\nAnother line.',
          speakerId: 'Alice',
        },
        { startSeconds: 66, endSeconds: 68, text: 'Goodbye.' },
      ],
    });
  });

  it('reads VTT cue identifiers, timing settings, voices and notes', () => {
    expect(
      parseTranscript(
        'meeting.vtt',
        'WEBVTT\n\nNOTE exported meeting\nnot speech\n\ncue-a\n01:02.500 --> 01:04.000 align:start\n<v Morgan>Hello &amp; welcome.</v>',
      ),
    ).toEqual({
      text: 'Morgan: Hello & welcome.',
      segments: [
        { startSeconds: 62.5, endSeconds: 64, text: 'Hello & welcome.', speakerId: 'Morgan' },
      ],
    });
  });

  it.each([
    ['notes.pdf', 'text'],
    ['notes.txt', '  '],
    ['notes.srt', '1\n00:00:05,000 --> 00:00:01,000\nBackwards'],
    ['notes.srt', '1\n00:70:00,000 --> 00:71:00,000\nBad minutes'],
    ['notes.srt', '1\n00:00:01,000 --> 00:00:02,000\nValid\n\n2\nbroken timestamp\nInvalid'],
    ['notes.vtt', '00:00:01.000 --> 00:00:02.000\nMissing header'],
    ['notes.vtt', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000'],
    ['notes.txt', '\u0000binary'],
  ])('rejects unsupported or malformed transcript %s', (name, text) => {
    expect(() => parseTranscript(name, text)).toThrow();
  });

  it('enforces the 2 MiB limit in UTF-8 bytes', () => {
    expect(() => parseTranscript('notes.txt', 'é'.repeat(1024 * 1024 + 1))).toThrow(/2 MiB/);
  });

  it('preserves both named voices in one cue without assigning all words to the first speaker', () => {
    const parsed = parseTranscript(
      'meeting.vtt',
      'WEBVTT\n\n00:01.000 --> 00:03.000\n<v Alice>Hello.</v>\n<v Bob>Hi.</v>',
    );
    expect(parsed.segments).toEqual([
      { startSeconds: 1, endSeconds: 3, text: 'Alice: Hello.\nBob: Hi.' },
    ]);
  });
});

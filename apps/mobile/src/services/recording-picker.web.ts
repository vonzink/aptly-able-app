import type { AudioImport } from '../features/recordings/recording-model';

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.setAttribute('aria-label', 'Choose a local file');
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}
export async function pickAudio(): Promise<AudioImport | null> {
  const file = await pickFile('.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4');
  return file
    ? {
        name: file.name,
        uri: URL.createObjectURL(file),
        sizeBytes: file.size,
        mimeType: file.type,
        blob: file,
      }
    : null;
}
export function releasePickedAudio(uri: string) {
  URL.revokeObjectURL(uri);
}
export async function pickTranscript() {
  const file = await pickFile('.txt,.srt,.vtt,text/plain,text/vtt,application/x-subrip');
  if (!file) return null;
  if (file.size > 2 * 1024 * 1024) throw new Error('Choose a transcript smaller than 2 MB.');
  return { name: file.name, text: await file.text() };
}

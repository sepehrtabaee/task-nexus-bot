import { config } from './config.js';

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';

export async function transcribeAudio(buffer, filename = 'audio.ogg', mimeType = 'audio/ogg') {
  const normalized = filename.replace(/\.oga$/i, '.ogg');
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), normalized);
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('language', 'en');

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper transcription failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.text;
}

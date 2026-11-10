// Calls Claude's Messages API (no extra package needed) to read uploaded forms.
// The file goes to Anthropic only for that request; nothing is stored there by this code.
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from '../../config/env';
import { HttpError } from '../../utils/httpError';

export function scannerReady() {
  return Boolean(ANTHROPIC_API_KEY);
}

// A PDF or image as a Messages API content block
export function mediaBlock(buffer: Buffer, mime: string) {
  const data = buffer.toString('base64');
  return mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data } };
}

// One Messages API call that must answer by "calling" the given tool; returns the tool's JSON input
export async function callClaude(opts: { system: string; tool: { name: string }; content: unknown[]; maxTokens: number }) {
  if (!scannerReady()) throw new HttpError(503, 'Form import is not set up yet: add ANTHROPIC_API_KEY to the backend .env');
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: opts.maxTokens,
        system: opts.system,
        tools: [opts.tool],
        tool_choice: { type: 'tool', name: opts.tool.name },
        messages: [{ role: 'user', content: opts.content }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new HttpError(502, 'Could not reach the document reading service. Check the internet connection and try again.');
  }

  if (!res.ok) {
    // log the reason for the developer, but never the document or the API key
    console.error('Document scanner error', res.status, (await res.text().catch(() => '')).slice(0, 300));
    if (res.status === 401 || res.status === 403) throw new HttpError(503, 'The AI API key is not valid. Check ANTHROPIC_API_KEY in .env');
    if (res.status === 429) throw new HttpError(429, 'The form reader is busy. Wait a minute and try again.');
    if (res.status === 400 || res.status === 413) throw new HttpError(400, 'This file could not be read. Try a clearer photo, or a smaller file.');
    throw new HttpError(502, 'The document could not be read right now. Try again, or type the details in.');
  }

  const body = (await res.json()) as { content?: { type: string; name?: string; input?: Record<string, unknown> }[] };
  const out = body.content?.find((b) => b.type === 'tool_use' && b.name === opts.tool.name)?.input;
  if (!out) throw new HttpError(502, 'The document could not be read. Try again, or type the details in.');
  return out;
}

export const ISO = /^\d{4}-\d{2}-\d{2}$/;

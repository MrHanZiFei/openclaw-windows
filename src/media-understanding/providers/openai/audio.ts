import path from "node:path";
import type { AudioTranscriptionRequest, AudioTranscriptionResult } from "../../types.js";
import {
  assertOkOrThrowHttpError,
  fetchWithTimeoutGuarded,
  normalizeBaseUrl,
  readErrorResponse,
} from "../shared.js";

export const DEFAULT_OPENAI_AUDIO_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_AUDIO_MODEL = "gpt-4o-mini-transcribe";

function resolveModel(model?: string): string {
  const trimmed = model?.trim();
  return trimmed || DEFAULT_OPENAI_AUDIO_MODEL;
}

function isQwenAsrModel(model: string): boolean {
  return /^qwen3-asr(?:-|$)/i.test(model.trim());
}

function resolveQwenAsrContentText(content: unknown): string | undefined {
  if (typeof content === "string") {
    const text = content.trim();
    return text || undefined;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const text = content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }
      const maybeText = (part as { text?: unknown }).text;
      return typeof maybeText === "string" ? maybeText.trim() : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || undefined;
}

async function transcribeQwenAsrViaChatCompletions(params: {
  baseUrl: string;
  allowPrivate: boolean;
  model: string;
  headers: Headers;
  timeoutMs: number;
  fetchFn: typeof fetch;
  request: AudioTranscriptionRequest;
}): Promise<AudioTranscriptionResult> {
  const mime = params.request.mime?.trim() || "audio/ogg";
  const base64Audio = params.request.buffer.toString("base64");
  const audioDataUri = `data:${mime};base64,${base64Audio}`;
  const language = params.request.language?.trim();
  // qwen3-asr models reject mixed text+audio content in chat/completions.
  // Send only input_audio and rely on model defaults/asr_options.
  const content: Array<Record<string, unknown>> = [
    {
      type: "input_audio",
      input_audio: {
        data: audioDataUri,
      },
    },
  ];
  const payload: Record<string, unknown> = {
    model: params.model,
    stream: false,
    messages: [{ role: "user", content }],
  };
  if (language) {
    payload.extra_body = {
      asr_options: {
        language,
      },
    };
  }

  const reqHeaders = new Headers(params.headers);
  if (!reqHeaders.has("content-type")) {
    reqHeaders.set("content-type", "application/json");
  }

  const url = `${params.baseUrl}/chat/completions`;
  const { response: res, release } = await fetchWithTimeoutGuarded(
    url,
    {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(payload),
    },
    params.timeoutMs,
    params.fetchFn,
    params.allowPrivate ? { ssrfPolicy: { allowPrivateNetwork: true } } : undefined,
  );

  try {
    if (!res.ok) {
      const detail = await readErrorResponse(res);
      const suffix = detail ? `: ${detail}` : "";
      throw new Error(`Audio transcription failed (HTTP ${res.status})${suffix}`);
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const text = resolveQwenAsrContentText(body.choices?.[0]?.message?.content);
    if (!text) {
      throw new Error("Audio transcription response missing text");
    }
    return { text, model: params.model };
  } finally {
    await release();
  }
}

export async function transcribeOpenAiCompatibleAudio(
  params: AudioTranscriptionRequest,
): Promise<AudioTranscriptionResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const baseUrl = normalizeBaseUrl(params.baseUrl, DEFAULT_OPENAI_AUDIO_BASE_URL);
  const allowPrivate = Boolean(params.baseUrl?.trim());
  const url = `${baseUrl}/audio/transcriptions`;

  const model = resolveModel(params.model);
  const form = new FormData();
  const fileName = params.fileName?.trim() || path.basename(params.fileName) || "audio";
  const bytes = new Uint8Array(params.buffer);
  const blob = new Blob([bytes], {
    type: params.mime ?? "application/octet-stream",
  });
  form.append("file", blob, fileName);
  form.append("model", model);
  if (params.language?.trim()) {
    form.append("language", params.language.trim());
  }
  if (params.prompt?.trim()) {
    form.append("prompt", params.prompt.trim());
  }

  const headers = new Headers(params.headers);
  if (!headers.has("authorization")) {
    headers.set("authorization", `Bearer ${params.apiKey}`);
  }

  if (isQwenAsrModel(model)) {
    return await transcribeQwenAsrViaChatCompletions({
      baseUrl,
      allowPrivate,
      model,
      headers,
      timeoutMs: params.timeoutMs,
      fetchFn,
      request: params,
    });
  }

  const { response: res, release } = await fetchWithTimeoutGuarded(
    url,
    {
      method: "POST",
      headers,
      body: form,
    },
    params.timeoutMs,
    fetchFn,
    allowPrivate ? { ssrfPolicy: { allowPrivateNetwork: true } } : undefined,
  );

  try {
    await assertOkOrThrowHttpError(res, "Audio transcription failed");

    const payload = (await res.json()) as { text?: string };
    const text = payload.text?.trim();
    if (!text) {
      throw new Error("Audio transcription response missing text");
    }
    return { text, model };
  } finally {
    await release();
  }
}

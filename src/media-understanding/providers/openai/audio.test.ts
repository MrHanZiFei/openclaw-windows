import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ssrf from "../../../infra/net/ssrf.js";
import { transcribeOpenAiCompatibleAudio } from "./audio.js";

const resolvePinnedHostname = ssrf.resolvePinnedHostname;
const resolvePinnedHostnameWithPolicy = ssrf.resolvePinnedHostnameWithPolicy;
const lookupMock = vi.fn();
let resolvePinnedHostnameSpy: ReturnType<typeof vi.spyOn> = null;
let resolvePinnedHostnameWithPolicySpy: ReturnType<typeof vi.spyOn> = null;

const resolveRequestUrl = (input: RequestInfo | URL) => {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
};

describe("transcribeOpenAiCompatibleAudio", () => {
  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    resolvePinnedHostnameSpy = vi
      .spyOn(ssrf, "resolvePinnedHostname")
      .mockImplementation((hostname) => resolvePinnedHostname(hostname, lookupMock));
    resolvePinnedHostnameWithPolicySpy = vi
      .spyOn(ssrf, "resolvePinnedHostnameWithPolicy")
      .mockImplementation((hostname, params) =>
        resolvePinnedHostnameWithPolicy(hostname, { ...params, lookupFn: lookupMock }),
      );
  });

  afterEach(() => {
    lookupMock.mockReset();
    resolvePinnedHostnameSpy?.mockRestore();
    resolvePinnedHostnameWithPolicySpy?.mockRestore();
    resolvePinnedHostnameSpy = null;
    resolvePinnedHostnameWithPolicySpy = null;
  });

  it("respects lowercase authorization header overrides", async () => {
    let seenAuth: string | null = null;
    const fetchFn = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seenAuth = headers.get("authorization");
      return new Response(JSON.stringify({ text: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await transcribeOpenAiCompatibleAudio({
      buffer: Buffer.from("audio"),
      fileName: "note.mp3",
      apiKey: "test-key",
      timeoutMs: 1000,
      headers: { authorization: "Bearer override" },
      fetchFn,
    });

    expect(seenAuth).toBe("Bearer override");
    expect(result.text).toBe("ok");
  });

  it("builds the expected request payload", async () => {
    let seenUrl: string | null = null;
    let seenInit: RequestInit | undefined;
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = resolveRequestUrl(input);
      seenInit = init;
      return new Response(JSON.stringify({ text: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await transcribeOpenAiCompatibleAudio({
      buffer: Buffer.from("audio-bytes"),
      fileName: "voice.wav",
      apiKey: "test-key",
      timeoutMs: 1234,
      baseUrl: "https://api.example.com/v1/",
      model: " ",
      language: " en ",
      prompt: " hello ",
      mime: "audio/wav",
      headers: { "X-Custom": "1" },
      fetchFn,
    });

    expect(result.model).toBe("gpt-4o-mini-transcribe");
    expect(result.text).toBe("hello");
    expect(seenUrl).toBe("https://api.example.com/v1/audio/transcriptions");
    expect(seenInit?.method).toBe("POST");
    expect(seenInit?.signal).toBeInstanceOf(AbortSignal);

    const headers = new Headers(seenInit?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-key");
    expect(headers.get("x-custom")).toBe("1");

    const form = seenInit?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(form.get("language")).toBe("en");
    expect(form.get("prompt")).toBe("hello");
    const file = form.get("file") as Blob | { type?: string; name?: string } | null;
    expect(file).not.toBeNull();
    if (file) {
      expect(file.type).toBe("audio/wav");
      if ("name" in file && typeof file.name === "string") {
        expect(file.name).toBe("voice.wav");
      }
    }
  });

  it("uses chat/completions for qwen3-asr models", async () => {
    let seenUrl: string | null = null;
    let seenInit: RequestInit | undefined;
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = resolveRequestUrl(input);
      seenInit = init;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "transcribed by qwen" } }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    };

    const result = await transcribeOpenAiCompatibleAudio({
      buffer: Buffer.from("audio-bytes"),
      fileName: "voice.ogg",
      apiKey: "test-key",
      timeoutMs: 4321,
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "qwen3-asr-flash",
      language: "zh",
      prompt: "Transcribe this audio.",
      mime: "audio/ogg",
      fetchFn,
    });

    expect(result.model).toBe("qwen3-asr-flash");
    expect(result.text).toBe("transcribed by qwen");
    expect(seenUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
    expect(seenInit?.method).toBe("POST");
    expect(seenInit?.signal).toBeInstanceOf(AbortSignal);

    const headers = new Headers(seenInit?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-key");
    expect(headers.get("content-type")).toBe("application/json");

    if (typeof seenInit?.body !== "string") {
      throw new Error(`expected fetch body to be a string, got ${typeof seenInit?.body}`);
    }
    const body = JSON.parse(seenInit.body) as {
      model?: string;
      messages?: Array<{
        content?: Array<{ type?: string; text?: string; input_audio?: { data?: string } }>;
      }>;
      extra_body?: { asr_options?: { language?: string } };
    };
    expect(body.model).toBe("qwen3-asr-flash");
    expect(body.extra_body?.asr_options?.language).toBe("zh");
    const parts = body.messages?.[0]?.content ?? [];
    expect(parts.find((part) => part.type === "text")).toBeUndefined();
    const inputAudio = parts.find((part) => part.type === "input_audio");
    expect(inputAudio?.input_audio?.data?.startsWith("data:audio/ogg;base64,")).toBe(true);
  });
});

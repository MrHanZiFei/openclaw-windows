import type { GatewayBrowserClient } from "../gateway.ts";
import type { ChatAttachment } from "../ui-types.ts";
import { extractText } from "../chat/message-extract.ts";
import { generateUUID } from "../uuid.ts";

export type ChatState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey: string;
  chatLoading: boolean;
  chatMessages: unknown[];
  chatThinkingLevel: string | null;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatRunId: string | null;
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  lastError: string | null;
};

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

const AGENT_SESSION_TOKEN_MARKER = "?token=";
const CHAT_EVENT_MESSAGE_LIMIT = 400;
const CHAT_EVENT_RUN_ID_FIELD = "__openclawRunId";

function normalizeSessionKeyForMatch(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (!trimmed.startsWith("agent:")) {
    return trimmed;
  }
  const markerIdx = trimmed.indexOf(AGENT_SESSION_TOKEN_MARKER);
  return markerIdx >= 0 ? trimmed.slice(0, markerIdx) : trimmed;
}

function sessionKeysMatch(current: string, incoming: string): boolean {
  if (current === incoming) {
    return true;
  }
  const left = normalizeSessionKeyForMatch(current);
  const right = normalizeSessionKeyForMatch(incoming);
  return Boolean(left && right && left === right);
}

function normalizeMessageForAppend(message: unknown): Record<string, unknown> | null {
  if (typeof message === "string") {
    return {
      role: "assistant",
      content: [{ type: "text", text: message }],
      timestamp: Date.now(),
    };
  }
  if (!message || typeof message !== "object") {
    return null;
  }
  const raw = message as Record<string, unknown>;
  const next: Record<string, unknown> = { ...raw };
  if (typeof next.role !== "string") {
    next.role = "assistant";
  }
  if (typeof next.timestamp !== "number") {
    next.timestamp = Date.now();
  }
  return next;
}

function messageIdentityKey(message: Record<string, unknown>): string {
  const runId = message[CHAT_EVENT_RUN_ID_FIELD];
  if (typeof runId === "string" && runId) {
    return `run:${runId}`;
  }
  const id = typeof message.id === "string" ? message.id : "";
  if (id) {
    return `id:${id}`;
  }
  const messageId = typeof message.messageId === "string" ? message.messageId : "";
  if (messageId) {
    return `messageId:${messageId}`;
  }
  const role = typeof message.role === "string" ? message.role : "assistant";
  const timestamp = typeof message.timestamp === "number" ? message.timestamp : 0;
  const text = extractText(message) ?? "";
  return `fallback:${role}:${timestamp}:${text}`;
}

function appendFinalMessageFromEvent(state: ChatState, payload: ChatEventPayload): boolean {
  const normalized = normalizeMessageForAppend(payload.message);
  if (!normalized) {
    return false;
  }
  normalized[CHAT_EVENT_RUN_ID_FIELD] = payload.runId;
  const key = messageIdentityKey(normalized);
  const history = Array.isArray(state.chatMessages) ? state.chatMessages : [];
  const tail = history.slice(-24);
  const exists = tail.some((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    return messageIdentityKey(entry as Record<string, unknown>) === key;
  });
  if (exists) {
    return true;
  }
  const merged = [...history, normalized];
  state.chatMessages =
    merged.length > CHAT_EVENT_MESSAGE_LIMIT ? merged.slice(-CHAT_EVENT_MESSAGE_LIMIT) : merged;
  return true;
}

export async function loadChatHistory(state: ChatState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.chatLoading = true;
  state.lastError = null;
  try {
    const res = await state.client.request<{ messages?: Array<unknown>; thinkingLevel?: string }>(
      "chat.history",
      {
        sessionKey: state.sessionKey,
        limit: 200,
      },
    );
    state.chatMessages = Array.isArray(res.messages) ? res.messages : [];
    state.chatThinkingLevel = res.thinkingLevel ?? null;
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.chatLoading = false;
  }
}

function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], content: match[2] };
}

export async function sendChatMessage(
  state: ChatState,
  message: string,
  attachments?: ChatAttachment[],
): Promise<string | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  const msg = message.trim();
  const hasAttachments = attachments && attachments.length > 0;
  if (!msg && !hasAttachments) {
    return null;
  }

  const now = Date.now();

  // Build user message content blocks
  const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
  if (msg) {
    contentBlocks.push({ type: "text", text: msg });
  }
  // Add image previews to the message for display
  if (hasAttachments) {
    for (const att of attachments) {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: att.mimeType, data: att.dataUrl },
      });
    }
  }

  state.chatMessages = [
    ...state.chatMessages,
    {
      role: "user",
      content: contentBlocks,
      timestamp: now,
    },
  ];

  state.chatSending = true;
  state.lastError = null;
  const runId = generateUUID();
  state.chatRunId = runId;
  state.chatStream = "";
  state.chatStreamStartedAt = now;

  // Convert attachments to API format
  const apiAttachments = hasAttachments
    ? attachments
        .map((att) => {
          const parsed = dataUrlToBase64(att.dataUrl);
          if (!parsed) {
            return null;
          }
          return {
            type: "image",
            mimeType: parsed.mimeType,
            content: parsed.content,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null)
    : undefined;

  try {
    await state.client.request("chat.send", {
      sessionKey: state.sessionKey,
      message: msg,
      deliver: false,
      idempotencyKey: runId,
      attachments: apiAttachments,
    });
    return runId;
  } catch (err) {
    const error = String(err);
    state.chatRunId = null;
    state.chatStream = null;
    state.chatStreamStartedAt = null;
    state.lastError = error;
    state.chatMessages = [
      ...state.chatMessages,
      {
        role: "assistant",
        content: [{ type: "text", text: "Error: " + error }],
        timestamp: Date.now(),
      },
    ];
    return null;
  } finally {
    state.chatSending = false;
  }
}

export async function abortChatRun(state: ChatState): Promise<boolean> {
  if (!state.client || !state.connected) {
    return false;
  }
  const runId = state.chatRunId;
  try {
    await state.client.request(
      "chat.abort",
      runId ? { sessionKey: state.sessionKey, runId } : { sessionKey: state.sessionKey },
    );
    return true;
  } catch (err) {
    state.lastError = String(err);
    return false;
  }
}

export function handleChatEvent(state: ChatState, payload?: ChatEventPayload) {
  if (!payload) {
    return null;
  }
  if (!sessionKeysMatch(state.sessionKey, payload.sessionKey)) {
    return null;
  }

  // Final from another run (e.g. sub-agent announce): append inline message and
  // let caller decide whether history reload is still needed as a fallback.
  // See https://github.com/openclaw/openclaw/issues/1909
  if (payload.runId && state.chatRunId && payload.runId !== state.chatRunId) {
    if (payload.state === "final") {
      appendFinalMessageFromEvent(state, payload);
      return "final";
    }
    return null;
  }

  if (payload.state === "delta") {
    const next = extractText(payload.message);
    if (typeof next === "string") {
      const current = state.chatStream ?? "";
      if (!current || next.length >= current.length) {
        state.chatStream = next;
      }
    }
  } else if (payload.state === "final") {
    appendFinalMessageFromEvent(state, payload);
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
  } else if (payload.state === "aborted") {
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
  } else if (payload.state === "error") {
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
    state.lastError = payload.errorMessage ?? "chat error";
  }
  return payload.state;
}

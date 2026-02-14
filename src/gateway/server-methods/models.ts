import crypto from "node:crypto";
import fs from "node:fs/promises";
import { resolveOpenClawAgentDir } from "../../agents/agent-paths.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { describeFailoverError } from "../../agents/failover-error.js";
import { normalizeProviderId } from "../../agents/model-selection.js";
import { runEmbeddedPiAgent } from "../../agents/pi-embedded.js";
import { resolveDefaultAgentWorkspaceDir } from "../../agents/workspace.js";
import { loadConfig } from "../../config/config.js";
import {
  resolveSessionTranscriptPath,
  resolveSessionTranscriptsDirForAgent,
} from "../../config/sessions/paths.js";
import { redactSecrets } from "../../commands/status-all/format.js";
import type { GatewayRequestHandlers } from "./types.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsListParams,
  validateModelsProbeParams,
} from "../protocol/index.js";

const PROBE_PROMPT = "Reply with OK. Do not use tools.";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;

type ProbeStatus =
  | "ok"
  | "auth"
  | "rate_limit"
  | "billing"
  | "timeout"
  | "format"
  | "unknown"
  | "no_model";

function toProbeStatus(reason?: string | null): ProbeStatus {
  if (!reason) {
    return "unknown";
  }
  if (reason === "auth") {
    return "auth";
  }
  if (reason === "rate_limit") {
    return "rate_limit";
  }
  if (reason === "billing") {
    return "billing";
  }
  if (reason === "timeout") {
    return "timeout";
  }
  if (reason === "format") {
    return "format";
  }
  return "unknown";
}

function resolveProviderConfig(
  providers: Record<string, unknown>,
  provider: string,
): { providerKey: string; cfg: Record<string, unknown> } | null {
  const direct = providers[provider];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return { providerKey: provider, cfg: direct as Record<string, unknown> };
  }
  const normalized = normalizeProviderId(provider);
  const normalizedDirect = providers[normalized];
  if (normalizedDirect && typeof normalizedDirect === "object" && !Array.isArray(normalizedDirect)) {
    return { providerKey: normalized, cfg: normalizedDirect as Record<string, unknown> };
  }
  const entry = Object.entries(providers).find(
    ([key]) => normalizeProviderId(key) === normalized,
  );
  if (!entry) {
    return null;
  }
  const [providerKey, cfg] = entry;
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    return null;
  }
  return { providerKey, cfg: cfg as Record<string, unknown> };
}

export const modelsHandlers: GatewayRequestHandlers = {
  "models.list": async ({ params, respond, context }) => {
    if (!validateModelsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.list params: ${formatValidationErrors(validateModelsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const models = await context.loadGatewayModelCatalog();
      respond(true, { models }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "models.probe": async ({ params, respond }) => {
    if (!validateModelsProbeParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.probe params: ${formatValidationErrors(validateModelsProbeParams.errors)}`,
        ),
      );
      return;
    }

    const ts = Date.now();
    const provider = String((params as { provider?: unknown }).provider ?? "").trim();
    const modelIdRaw = String((params as { modelId?: unknown }).modelId ?? "").trim();
    const timeoutRaw = (params as { timeoutMs?: unknown }).timeoutMs;
    const timeoutMs =
      typeof timeoutRaw === "number"
        ? Math.max(0, Math.min(MAX_TIMEOUT_MS, timeoutRaw))
        : DEFAULT_TIMEOUT_MS;

    const cfg = loadConfig();
    const providers = (cfg.models?.providers ?? {}) as Record<string, unknown>;
    const providerResolved = resolveProviderConfig(providers, provider);
    if (!providerResolved) {
      respond(true, { provider, status: "unknown", error: "Provider not configured.", ts }, undefined);
      return;
    }

    const providerKey = providerResolved.providerKey;
    const modelId = (() => {
      if (modelIdRaw) {
        return modelIdRaw;
      }
      const models = providerResolved.cfg.models;
      if (Array.isArray(models) && models.length > 0) {
        const first = models[0];
        if (first && typeof first === "object" && !Array.isArray(first)) {
          const id = (first as Record<string, unknown>).id;
          if (typeof id === "string" && id.trim()) {
            return id.trim();
          }
        }
      }
      return "";
    })();

    if (!modelId) {
      respond(true, { provider: providerKey, status: "no_model", error: "No model configured for probe.", ts }, undefined);
      return;
    }

    const agentId = resolveDefaultAgentId(cfg);
    const agentDir = resolveOpenClawAgentDir();
    const workspaceDir =
      resolveAgentWorkspaceDir(cfg, agentId) ?? resolveDefaultAgentWorkspaceDir();
    const sessionDir = resolveSessionTranscriptsDirForAgent(agentId);
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(sessionDir, { recursive: true });

    const sessionId = `probe-${providerKey}-${crypto.randomUUID()}`;
    const sessionFile = resolveSessionTranscriptPath(sessionId, agentId);

    const startedAt = Date.now();
    try {
      await runEmbeddedPiAgent({
        sessionId,
        sessionFile,
        workspaceDir,
        agentDir,
        agentId,
        config: cfg,
        prompt: PROBE_PROMPT,
        provider: providerKey,
        model: modelId,
        thinkLevel: "off",
        reasoningLevel: "off",
        verboseLevel: "off",
        disableTools: true,
        timeoutMs,
        runId: `models-probe-${crypto.randomUUID()}`,
        streamParams: { maxTokens: 16 },
        enforceFinalTag: false,
      });
      respond(
        true,
        { provider: providerKey, model: `${providerKey}/${modelId}`, status: "ok", latencyMs: Date.now() - startedAt, ts },
        undefined,
      );
    } catch (err) {
      const described = describeFailoverError(err);
      respond(
        true,
        {
          provider: providerKey,
          model: `${providerKey}/${modelId}`,
          status: toProbeStatus(described.reason),
          error: redactSecrets(described.message),
          latencyMs: Date.now() - startedAt,
          ts,
        },
        undefined,
      );
    }
  },
};

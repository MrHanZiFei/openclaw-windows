import { html, nothing } from "lit";
import type { UiLocale } from "../i18n.ts";
import { pickLocaleText } from "../i18n.ts";

const REDACTED_SENTINEL = "__OPENCLAW_REDACTED__";

type ProviderApi = "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";

export type ConfigTableProps = {
  locale: UiLocale;
  connected: boolean;
  loading: boolean;
  saving: boolean;
  applying: boolean;
  dirty: boolean;
  formValue: Record<string, unknown> | null;
  probeByProvider: Record<string, unknown>;
  probeBusyByProvider: Record<string, boolean>;
  onFormPatch: (path: Array<string | number>, value: unknown) => void;
  onFormRemove: (path: Array<string | number>) => void;
  onReload: () => void;
  onSave: () => void;
  onApply: () => void;
  onProbeProvider: (providerId: string) => void | Promise<void>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readProviders(formValue: Record<string, unknown> | null): Record<string, unknown> {
  const root = asRecord(formValue);
  const models = asRecord(root?.models);
  const providers = asRecord(models?.providers);
  return providers ?? {};
}

function readAgentDefaultsModelSelection(formValue: Record<string, unknown> | null): {
  primary: string;
  fallbacks: string[];
} {
  const root = asRecord(formValue);
  const agents = asRecord(root?.agents);
  const defaults = asRecord(agents?.defaults);
  const model = asRecord(defaults?.model);

  const primary = readString(model?.primary);
  const fallbacksRaw = model?.fallbacks;
  const fallbacks = Array.isArray(fallbacksRaw)
    ? fallbacksRaw
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  return { primary, fallbacks };
}

function parseModelRefProvider(raw: string): string | null {
  const trimmed = raw.trim();
  const idx = trimmed.indexOf("/");
  if (idx <= 0) {
    return null;
  }
  return trimmed.slice(0, idx);
}

function isProviderApi(value: string): value is ProviderApi {
  return (
    value === "openai-completions" ||
    value === "openai-responses" ||
    value === "anthropic-messages" ||
    value === "google-generative-ai"
  );
}

function normalizeProviderApi(value: unknown): ProviderApi {
  const raw = typeof value === "string" ? value.trim() : "";
  return isProviderApi(raw) ? raw : "openai-completions";
}

type CopyOutcome = "ok" | "prompt" | "fail";

async function copyTextToClipboard(text: string): Promise<CopyOutcome> {
  if (!text) {
    return "fail";
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return "ok";
    }
  } catch {
    // fall through to execCommand
  }

  // Fallback for HTTP / non-secure contexts.
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (ok) {
      return "ok";
    }
  } catch {
    // fall through
  }

  // Last resort: show a prompt so the user can Ctrl+C reliably.
  try {
    window.prompt("Copy to clipboard:", text);
    return "prompt";
  } catch {
    return "fail";
  }
}

function describeApiKey(raw: unknown, locale: UiLocale): string {
  const setLabel = pickLocaleText(locale, "(set)", "(set)");
  const missingLabel = pickLocaleText(locale, "(missing)", "(missing)");
  if (raw === REDACTED_SENTINEL) {
    return setLabel;
  }
  if (typeof raw === "string" && raw.trim()) {
    return setLabel;
  }
  return missingLabel;
}

export function renderConfigTable(props: ConfigTableProps) {
  const providers = readProviders(props.formValue);
  const providerIds = Object.keys(providers).sort((a, b) => a.localeCompare(b));
  const modelSelection = readAgentDefaultsModelSelection(props.formValue);
  const primaryProvider = parseModelRefProvider(modelSelection.primary);
  const fallbackProviderCounts = new Map<string, number>();
  for (const fallback of modelSelection.fallbacks) {
    const provider = parseModelRefProvider(fallback);
    if (!provider) {
      continue;
    }
    fallbackProviderCounts.set(provider, (fallbackProviderCounts.get(provider) ?? 0) + 1);
  }
  const editable = props.connected && !props.loading && !props.saving && !props.applying;

  return html`
    <section>
      <div class="card">
        <div class="card-title">
          ${pickLocaleText(props.locale, "Model Provider Config (Table)", "模型提供商配置（表格）")}
        </div>
        <div class="card-sub">
          ${pickLocaleText(
            props.locale,
            "Edits write into models.providers and use the same Apply flow as the raw config editor.",
            "修改会写入 models.providers，并使用与原始 Config 页面相同的 Apply 流程全局生效。",
          )}
        </div>

        ${!props.connected
          ? html`<div class="callout danger" style="margin-top: 12px;">
              ${pickLocaleText(props.locale, "Disconnected from gateway.", "与网关断开连接。")}
            </div>`
          : nothing}

        <div style="display: flex; margin-top: 12px; gap: 8px; flex-wrap: wrap;">
          <button class="btn" ?disabled=${!props.connected || props.loading} @click=${props.onReload}>
            ${props.loading ? pickLocaleText(props.locale, "Loading...", "加载中...") : pickLocaleText(props.locale, "Reload", "刷新")}
          </button>
          <button class="btn" ?disabled=${!editable || !props.dirty} @click=${props.onSave}>
            ${props.saving ? pickLocaleText(props.locale, "Saving...", "保存中...") : pickLocaleText(props.locale, "Save", "保存")}
          </button>
          <button class="btn primary" ?disabled=${!editable || !props.dirty} @click=${props.onApply}>
            ${props.applying
              ? pickLocaleText(props.locale, "Applying...", "应用中...")
              : pickLocaleText(props.locale, "Apply (Restart)", "应用（重启）")}
          </button>
          ${props.dirty
            ? html`<span class="pill warn">${pickLocaleText(props.locale, "Unsaved changes", "未保存修改")}</span>`
            : html`<span class="pill">${pickLocaleText(props.locale, "No changes", "无修改")}</span>`}
        </div>

        <div class="callout" style="margin-top: 16px;">
          <div class="label" style="margin-bottom: 10px;">
            ${pickLocaleText(props.locale, "Default Model Selection (Primary + Fallbacks)", "默认模型选择（主 + 备）")}
          </div>
          <div style="display: grid; grid-template-columns: minmax(240px, 1fr) minmax(240px, 1.2fr); gap: 12px;">
            <div>
              <div class="label" style="margin-bottom: 6px;">${pickLocaleText(props.locale, "Primary", "主")}</div>
              <input
                class="cfg-input cfg-input--sm"
                .value=${modelSelection.primary}
                ?disabled=${!editable}
                placeholder="provider/model"
                @change=${(e: Event) => {
                  const value = (e.target as HTMLInputElement).value.trim();
                  if (!value) {
                    props.onFormRemove(["agents", "defaults", "model", "primary"]);
                    return;
                  }
                  props.onFormPatch(["agents", "defaults", "model", "primary"], value);
                }}
              />
            </div>

            <div>
              <div class="label" style="margin-bottom: 6px;">
                ${pickLocaleText(props.locale, "Fallbacks (one per line)", "备用（每行一个）")}
              </div>
              <textarea
                class="cfg-textarea cfg-textarea--sm"
                rows="3"
                ?disabled=${!editable}
                .value=${modelSelection.fallbacks.join("\n")}
                placeholder="provider/model"
                @change=${(e: Event) => {
                  const raw = (e.target as HTMLTextAreaElement).value;
                  const list = raw
                    .split(/\\r?\\n/u)
                    .map((line) => line.trim())
                    .filter(Boolean);
                  if (list.length === 0) {
                    props.onFormRemove(["agents", "defaults", "model", "fallbacks"]);
                    return;
                  }
                  props.onFormPatch(["agents", "defaults", "model", "fallbacks"], list);
                }}
              ></textarea>
            </div>
          </div>
          <div class="muted" style="margin-top: 10px;">
            ${pickLocaleText(
              props.locale,
              "These are agents.defaults.model.primary/fallbacks. Apply (Restart) to make changes take effect.",
              "对应 agents.defaults.model.primary/fallbacks。修改后请点击 应用（重启） 使其生效。",
            )}
          </div>
        </div>

        <div class="table table--config" style="margin-top: 16px;">
          <div class="table-head">
            <div>${pickLocaleText(props.locale, "Provider", "提供商")}</div>
            <div>${pickLocaleText(props.locale, "API", "协议")}</div>
            <div>${pickLocaleText(props.locale, "Base URL", "Base URL")}</div>
            <div>${pickLocaleText(props.locale, "API Key", "API Key")}</div>
            <div>${pickLocaleText(props.locale, "Models", "模型")}</div>
            <div>${pickLocaleText(props.locale, "Actions", "操作")}</div>
          </div>

          ${providerIds.length === 0
            ? html`<div class="muted">${pickLocaleText(props.locale, "No providers configured.", "未配置提供商。")}</div>`
            : providerIds.map((providerId) => {
                const provider = asRecord(providers[providerId]) ?? {};
                const api = normalizeProviderApi(provider.api);
                const baseUrl = readString(provider.baseUrl);
                const apiKey = (provider as Record<string, unknown>).apiKey;
                const modelDefs = Array.isArray((provider as Record<string, unknown>).models)
                  ? ((provider as Record<string, unknown>).models as unknown[])
                  : [];
                const modelIds = modelDefs
                  .map((entry) => readString(asRecord(entry)?.id).trim())
                  .filter(Boolean);
                const modelsPreview = (() => {
                  if (modelIds.length === 0) {
                    return "-";
                  }
                  const shown = modelIds.slice(0, 2).join(", ");
                  const remaining = modelIds.length - 2;
                  return remaining > 0 ? `${shown} (+${remaining})` : shown;
                })();
                const isPrimaryProvider = Boolean(primaryProvider && providerId === primaryProvider);
                const fallbackCount = fallbackProviderCounts.get(providerId) ?? 0;

                const apiKeyHint = describeApiKey(apiKey, props.locale);
                const apiKeyRaw =
                  apiKey === REDACTED_SENTINEL
                    ? null
                    : typeof apiKey === "string" && apiKey.trim().length > 0
                      ? apiKey.trim()
                      : null;
                const apiKeyDisplay =
                  apiKey === REDACTED_SENTINEL
                    ? pickLocaleText(props.locale, "(redacted)", "(redacted)")
                    : apiKeyRaw ?? pickLocaleText(props.locale, "(missing)", "(missing)");
                const copyLabel = pickLocaleText(props.locale, "Copy", "复制");
                const copiedLabel = pickLocaleText(props.locale, "Copied", "已复制");
                const manualLabel = pickLocaleText(props.locale, "Manual copy", "手动复制");
                const failedLabel = pickLocaleText(props.locale, "Failed", "失败");
                const canCopy = apiKeyRaw != null;
                const apiKeyPlaceholder =
                  apiKey === REDACTED_SENTINEL
                    ? pickLocaleText(props.locale, "Leave blank to keep existing", "Leave blank to keep existing")
                    : pickLocaleText(props.locale, "Enter new key or env var name", "Enter new key or env var name");

                const probe = asRecord(props.probeByProvider[providerId]);
                const probeStatus = readString(probe?.status).trim();
                const probeLatencyMs =
                  typeof probe?.latencyMs === "number" && Number.isFinite(probe?.latencyMs)
                    ? Math.max(0, Math.round(probe.latencyMs))
                    : null;
                const probeError = readString(probe?.error).trim();
                const probeModel = readString(probe?.model).trim();
                const probeTs =
                  typeof probe?.ts === "number" && Number.isFinite(probe?.ts) ? probe.ts : null;
                const probeBusy = Boolean(props.probeBusyByProvider[providerId]);
                const canProbe =
                  props.connected && !props.loading && !props.saving && !props.applying && !props.dirty;
                const probePill = (() => {
                  if (!probeStatus) {
                    return nothing;
                  }
                  const klass =
                    probeStatus === "ok"
                      ? "ok"
                      : probeStatus === "timeout" || probeStatus === "rate_limit" || probeStatus === "unknown"
                        ? "warn"
                        : "danger";
                  const label =
                    probeStatus === "ok"
                      ? "OK"
                      : probeStatus === "auth"
                        ? "Auth"
                        : probeStatus === "billing"
                          ? "Billing"
                          : probeStatus === "rate_limit"
                            ? "Rate limit"
                            : probeStatus === "timeout"
                              ? "Timeout"
                              : probeStatus === "format"
                                ? "Bad response"
                                : probeStatus === "no_model"
                                  ? "No model"
                                  : "Unknown";
                  const latency = probeLatencyMs != null ? ` ${probeLatencyMs}ms` : "";
                  const title = [
                    probeModel ? `model: ${probeModel}` : null,
                    probeTs != null ? `ts: ${new Date(probeTs).toISOString()}` : null,
                    probeError ? `error: ${probeError}` : null,
                  ]
                    .filter((line): line is string => Boolean(line))
                    .join("\n");
                  return html`<span class="pill ${klass}" title=${title}>${label}${latency}</span>`;
                })();

                return html`
                  <div class="table-row">
                    <div class="mono config-table-provider">
                      <span>${providerId}</span>
                      ${isPrimaryProvider
                        ? html`<span class="pill ok">${pickLocaleText(props.locale, "Primary", "主")}</span>`
                        : nothing}
                      ${fallbackCount > 0
                        ? html`<span class="pill warn"
                            >${pickLocaleText(props.locale, "Fallback", "备")}${fallbackCount > 1
                              ? ` x${fallbackCount}`
                              : ""}</span
                          >`
                        : nothing}
                    </div>
                    <div>
                      <select
                        class="cfg-select cfg-input--sm"
                        ?disabled=${!editable}
                        .value=${api}
                        @change=${(e: Event) => {
                          const value = (e.target as HTMLSelectElement).value;
                          props.onFormPatch(["models", "providers", providerId, "api"], value);
                        }}
                      >
                        <option value="openai-completions">openai-completions</option>
                        <option value="openai-responses">openai-responses</option>
                        <option value="anthropic-messages">anthropic-messages</option>
                        <option value="google-generative-ai">google-generative-ai</option>
                      </select>
                    </div>
                    <div>
                      <textarea
                        class="cfg-textarea cfg-textarea--sm config-table-baseurl"
                        .value=${baseUrl}
                        ?disabled=${!editable}
                        placeholder="https://..."
                        rows="2"
                        @change=${(e: Event) => {
                          const value = (e.target as HTMLTextAreaElement).value.trim();
                          props.onFormPatch(["models", "providers", providerId, "baseUrl"], value);
                        }}
                      ></textarea>
                    </div>
                    <div>
                      <div class="config-table-keyline">
                        <textarea
                          class="cfg-textarea cfg-textarea--sm config-table-apikey"
                          readonly
                          rows="2"
                          .value=${apiKeyDisplay}
                        ></textarea>
                        <button
                          class="btn btn--sm"
                          ?disabled=${!canCopy}
                          @click=${async (e: Event) => {
                            if (!apiKeyRaw) {
                              return;
                            }
                            const btn = e.currentTarget as HTMLButtonElement;
                            const original = btn.textContent || copyLabel;
                            const outcome = await copyTextToClipboard(apiKeyRaw);
                            btn.textContent =
                              outcome === "ok" ? copiedLabel : outcome === "prompt" ? manualLabel : failedLabel;
                            window.setTimeout(() => {
                              btn.textContent = original;
                            }, 1200);
                          }}
                        >
                          ${copyLabel}
                        </button>
                      </div>
                      <input
                        type="text"
                        class="cfg-input cfg-input--sm"
                        ?disabled=${!editable}
                        placeholder=${apiKeyPlaceholder}
                        @change=${(e: Event) => {
                          const value = (e.target as HTMLInputElement).value.trim();
                          if (!value) {
                            // Empty input means "don't change" for redacted values.
                            // For non-redacted values, we also treat empty as no-op to avoid accidental clears.
                            (e.target as HTMLInputElement).value = "";
                            return;
                          }
                          props.onFormPatch(["models", "providers", providerId, "apiKey"], value);
                          (e.target as HTMLInputElement).value = "";
                        }}
                      />
                      <div class="muted" style="margin-top: 6px;">${apiKeyHint}</div>
                    </div>
                    <div class="mono" title=${modelIds.join("\n")}>${modelsPreview}</div>
                    <div>
                      <div class="config-table-actions">
                        <button
                          class="btn btn--sm"
                          ?disabled=${!canProbe || probeBusy}
                          @click=${() => props.onProbeProvider(providerId)}
                          title=${props.dirty
                            ? pickLocaleText(props.locale, "Apply changes before verifying.", "请先应用修改再验证。")
                            : pickLocaleText(props.locale, "Probe provider credentials (server-side).", "在服务端探测该 provider 的鉴权是否可用。")}
                        >
                          ${probeBusy
                            ? pickLocaleText(props.locale, "Verifying...", "验证中...")
                            : pickLocaleText(props.locale, "Verify", "验证")}
                        </button>

                        <button
                          class="btn btn--sm"
                          ?disabled=${!editable}
                          @click=${() => {
                            props.onFormRemove(["models", "providers", providerId, "apiKey"]);
                          }}
                          title=${pickLocaleText(props.locale, "Clear apiKey (dangerous)", "清空 apiKey（谨慎）")}
                        >
                          ${pickLocaleText(props.locale, "Clear", "清空")}
                        </button>

                        ${probePill}
                      </div>

                      ${probeError
                        ? html`<div class="muted config-table-probe-error" title=${probeError}>${probeError}</div>`
                        : nothing}
                    </div>
                  </div>
                `;
              })}
        </div>

        <div class="callout warn" style="margin-top: 16px;">
          ${pickLocaleText(
            props.locale,
            "Tip: For providers, storing an env var name (e.g. ARK_API_KEY) is usually safer than storing a raw secret in the config file.",
            "提示：对 provider 来说，把环境变量名（例如 ARK_API_KEY）写进配置通常比直接写明文密钥更安全。",
          )}
        </div>
      </div>
    </section>
  `;
}

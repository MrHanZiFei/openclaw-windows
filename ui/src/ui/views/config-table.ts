import { html, nothing } from "lit";
import type { UiLocale } from "../i18n.ts";
import { pickLocaleText } from "../i18n.ts";

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

function isValidProviderId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value);
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

  const handleAddProvider = () => {
    if (!editable) {
      return;
    }
    const promptText = pickLocaleText(
      props.locale,
      "Enter new provider id (letters, numbers, dot, dash, underscore).",
      "请输入新的提供商 ID（字母、数字、点、横线、下划线）。",
    );
    const raw = window.prompt(promptText, "");
    if (raw == null) {
      return;
    }
    const providerId = raw.trim();
    if (!providerId) {
      window.alert(pickLocaleText(props.locale, "Provider id cannot be empty.", "提供商 ID 不能为空。"));
      return;
    }
    if (!isValidProviderId(providerId)) {
      window.alert(
        pickLocaleText(
          props.locale,
          "Invalid provider id. Allowed: letters, numbers, dot, dash, underscore.",
          "提供商 ID 不合法。仅允许字母、数字、点、横线、下划线。",
        ),
      );
      return;
    }
    if (providerIds.includes(providerId)) {
      window.alert(pickLocaleText(props.locale, "Provider already exists.", "提供商已存在。"));
      return;
    }

    props.onFormPatch(["models", "providers", providerId], {
      api: "openai-completions",
      baseUrl: "",
      models: [],
    });
  };

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
            "修改会写入 models.providers，并使用与原始配置编辑器相同的 Apply 流程。",
          )}
        </div>

        ${!props.connected
          ? html`<div class="callout danger" style="margin-top: 12px;">
              ${pickLocaleText(props.locale, "Disconnected from gateway.", "与网关断开连接。")}
            </div>`
          : nothing}

        <div style="display: flex; margin-top: 12px; gap: 8px; flex-wrap: wrap;">
          <button class="btn" ?disabled=${!props.connected || props.loading} @click=${props.onReload}>
            ${props.loading
              ? pickLocaleText(props.locale, "Loading...", "加载中...")
              : pickLocaleText(props.locale, "Reload", "刷新")}
          </button>
          <button class="btn" ?disabled=${!editable || !props.dirty} @click=${props.onSave}>
            ${props.saving ? pickLocaleText(props.locale, "Saving...", "保存中...") : pickLocaleText(props.locale, "Save", "保存")}
          </button>
          <button class="btn primary" ?disabled=${!editable || !props.dirty} @click=${props.onApply}>
            ${props.applying
              ? pickLocaleText(props.locale, "Applying...", "应用中...")
              : pickLocaleText(props.locale, "Apply (Restart)", "应用（重启）")}
          </button>
          <button class="btn" ?disabled=${!editable} @click=${handleAddProvider}>
            ${pickLocaleText(props.locale, "Add Provider", "新增提供商")}
          </button>
          ${props.dirty
            ? html`<span class="pill warn">${pickLocaleText(props.locale, "Unsaved changes", "未保存修改")}</span>`
            : html`<span class="pill">${pickLocaleText(props.locale, "No changes", "无修改")}</span>`}
        </div>

        <div class="config-table-scroll" style="margin-top: 16px;">
          <div class="table table--config">
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
                  const fallbackRefsForProvider = modelSelection.fallbacks.filter(
                    (entry) => parseModelRefProvider(entry) === providerId,
                  );
                  const fallbackRef = fallbackRefsForProvider[0] ?? null;
                  const preferredModelRef =
                    modelIds.length > 0
                      ? `${providerId}/${modelIds[0]}`
                      : fallbackRef ?? (isPrimaryProvider ? modelSelection.primary : null);

                  const setPrimaryDisabled = !editable || isPrimaryProvider || !preferredModelRef;
                  const toggleFallbackDisabled = !editable || (fallbackRefsForProvider.length === 0 && !preferredModelRef);

                  const probe = asRecord(props.probeByProvider[providerId]);
                  const probeStatus = readString(probe?.status).trim();
                  const probeLatencyMs =
                    typeof probe?.latencyMs === "number" && Number.isFinite(probe?.latencyMs)
                      ? Math.max(0, Math.round(probe.latencyMs))
                      : null;
                  const probeError = readString(probe?.error).trim();
                  const probeModel = readString(probe?.model).trim();
                  const probeTs = typeof probe?.ts === "number" && Number.isFinite(probe?.ts) ? probe.ts : null;
                  const probeBusy = Boolean(props.probeBusyByProvider[providerId]);
                  const canProbe =
                    props.connected && !props.loading && !props.saving && !props.applying && !props.dirty;

                  const fallbackPath: Array<string | number> = ["agents", "defaults", "model", "fallbacks"];
                  const removeProviderFromFallbacks = () => {
                    const nextFallbacks = modelSelection.fallbacks.filter(
                      (entry) => parseModelRefProvider(entry) !== providerId,
                    );
                    if (nextFallbacks.length === 0) {
                      props.onFormRemove(fallbackPath);
                      return;
                    }
                    props.onFormPatch(fallbackPath, nextFallbacks);
                  };

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
                        <input
                          type="text"
                          class="cfg-input cfg-input--sm"
                          ?disabled=${!editable}
                          placeholder=${pickLocaleText(
                            props.locale,
                            "Enter new key or env var name",
                            "输入新的 Key 或环境变量名",
                          )}
                          @change=${(e: Event) => {
                            const value = (e.target as HTMLInputElement).value.trim();
                            if (!value) {
                              (e.target as HTMLInputElement).value = "";
                              return;
                            }
                            props.onFormPatch(["models", "providers", providerId, "apiKey"], value);
                            (e.target as HTMLInputElement).value = "";
                          }}
                        />
                        <div class="muted" style="margin-top: 6px;">
                          ${pickLocaleText(
                            props.locale,
                            "For safety, existing keys are not displayed. Leave blank to keep unchanged.",
                            "为安全起见，当前 Key 不会显示；留空表示不修改。",
                          )}
                        </div>
                      </div>

                      <div class="mono" title=${modelIds.join("\n")}>${modelsPreview}</div>

                      <div>
                        <div class="config-table-actions">
                          <button
                            class="btn btn--sm"
                            ?disabled=${setPrimaryDisabled}
                            @click=${() => {
                              if (!preferredModelRef) {
                                return;
                              }
                              props.onFormPatch(["agents", "defaults", "model", "primary"], preferredModelRef);
                              removeProviderFromFallbacks();
                            }}
                          >
                            ${isPrimaryProvider
                              ? pickLocaleText(props.locale, "Primary", "主")
                              : pickLocaleText(props.locale, "Set Primary", "设主")}
                          </button>

                          <button
                            class="btn btn--sm"
                            ?disabled=${toggleFallbackDisabled}
                            @click=${() => {
                              if (fallbackRefsForProvider.length > 0) {
                                removeProviderFromFallbacks();
                                return;
                              }
                              if (!preferredModelRef) {
                                return;
                              }
                              props.onFormPatch(fallbackPath, [...modelSelection.fallbacks, preferredModelRef]);
                            }}
                          >
                            ${fallbackRefsForProvider.length > 0
                              ? pickLocaleText(props.locale, "Unset Backup", "移备")
                              : pickLocaleText(props.locale, "Set Backup", "设为备")}
                          </button>

                          <button
                            class="btn btn--sm"
                            ?disabled=${!canProbe || probeBusy}
                            @click=${() => props.onProbeProvider(providerId)}
                            title=${props.dirty
                              ? pickLocaleText(props.locale, "Apply changes before verifying.", "请先应用修改再验证。")
                              : pickLocaleText(
                                  props.locale,
                                  "Probe provider credentials (server-side).",
                                  "在服务端探测 provider 鉴权是否可用。",
                                )}
                          >
                            ${probeBusy
                              ? pickLocaleText(props.locale, "Verifying...", "验证中...")
                              : pickLocaleText(props.locale, "Verify", "验证")}
                          </button>

                          <button
                            class="btn btn--sm danger"
                            ?disabled=${!editable}
                            @click=${() => {
                              const confirmed = window.confirm(
                                pickLocaleText(
                                  props.locale,
                                  `Delete provider "${providerId}"? This cannot be undone.`,
                                  `确认删除提供商 "${providerId}" 吗？此操作不可撤销。`,
                                ),
                              );
                              if (!confirmed) {
                                return;
                              }
                              props.onFormRemove(["models", "providers", providerId]);
                            }}
                            title=${pickLocaleText(props.locale, "Delete provider", "删除提供商")}
                          >
                            ${pickLocaleText(props.locale, "Delete", "删除")}
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
        </div>

        <div class="callout warn" style="margin-top: 16px;">
          ${pickLocaleText(
            props.locale,
            "Tip: For providers, storing an env var name (e.g. ARK_API_KEY) is usually safer than storing a raw secret in the config file.",
            "提示：对于 provider，写环境变量名（如 ARK_API_KEY）通常比在配置中写明文密钥更安全。",
          )}
        </div>
      </div>
    </section>
  `;
}

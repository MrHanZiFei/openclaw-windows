import { html } from "lit";
import type { GatewayHelloOk } from "../gateway.ts";
import type { UiSettings } from "../storage.ts";
import { formatRelativeTimestamp, formatDurationHuman } from "../format.ts";
import { pickLocaleText, type UiLocale } from "../i18n.ts";
import { formatNextRun } from "../presenter.ts";

export type OverviewProps = {
  locale: UiLocale;
  connected: boolean;
  hello: GatewayHelloOk | null;
  settings: UiSettings;
  password: string;
  lastError: string | null;
  workspace: string;
  workspaceLoading: boolean;
  workspaceDirty: boolean;
  workspaceSaving: boolean;
  workspaceApplying: boolean;
  presenceCount: number;
  sessionsCount: number | null;
  cronEnabled: boolean | null;
  cronNext: number | null;
  lastChannelsRefresh: number | null;
  onSettingsChange: (next: UiSettings) => void;
  onPasswordChange: (next: string) => void;
  onSessionKeyChange: (next: string) => void;
  onWorkspaceChange: (next: string) => void;
  onWorkspaceSave: () => void;
  onWorkspaceApply: () => void;
  onConnect: () => void;
  onRefresh: () => void;
};

export function renderOverview(props: OverviewProps) {
  const t = (english: string, chinese: string) => pickLocaleText(props.locale, english, chinese);
  const naLabel = t("n/a", "不可用");

  const snapshot = props.hello?.snapshot as
    | { uptimeMs?: number; policy?: { tickIntervalMs?: number } }
    | undefined;
  const uptimeMs = snapshot?.uptimeMs;
  const uptime =
    typeof uptimeMs === "number" && Number.isFinite(uptimeMs)
      ? formatDurationHuman(uptimeMs)
      : naLabel;
  const tickIntervalMs =
    (typeof props.hello?.policy?.tickIntervalMs === "number"
      ? props.hello.policy.tickIntervalMs
      : undefined) ??
    (typeof snapshot?.policy?.tickIntervalMs === "number"
      ? snapshot.policy.tickIntervalMs
      : undefined);
  const tick =
    typeof tickIntervalMs === "number" && Number.isFinite(tickIntervalMs)
      ? `${tickIntervalMs}ms`
      : naLabel;
  const authHint = (() => {
    if (props.connected || !props.lastError) {
      return null;
    }
    const lower = props.lastError.toLowerCase();
    const authFailed = lower.includes("unauthorized") || lower.includes("connect failed");
    if (!authFailed) {
      return null;
    }
    const hasToken = Boolean(props.settings.token.trim());
    const hasPassword = Boolean(props.password.trim());
    if (!hasToken && !hasPassword) {
      return html`
        <div class="muted" style="margin-top: 8px">
          ${t(
            "This gateway requires auth. Add a token or password, then click Connect.",
            "此网关需要鉴权。请填写 token 或密码，然后点击连接。",
          )}
          <div style="margin-top: 6px">
            <span class="mono">openclaw dashboard --no-open</span> -> ${t(
              "open the Control UI",
              "打开 Control UI",
            )}<br />
            <span class="mono">openclaw doctor --generate-gateway-token</span> -> ${t(
              "set token",
              "生成并设置 token",
            )}
          </div>
          <div style="margin-top: 6px">
            <a
              class="session-link"
              href="https://docs.openclaw.ai/web/dashboard"
              target="_blank"
              rel="noreferrer"
              title=${t("Control UI auth docs (opens in new tab)", "Control UI 鉴权文档（新标签页打开）")}
              >${t("Docs: Control UI auth", "文档：Control UI 鉴权")}</a
            >
          </div>
        </div>
      `;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t(
          "Auth failed. Update the token or password in Control UI settings, then click Connect.",
          "鉴权失败。请在 Control UI 设置中更新 token 或密码后再次连接。",
        )}
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/dashboard"
            target="_blank"
            rel="noreferrer"
            title=${t("Control UI auth docs (opens in new tab)", "Control UI 鉴权文档（新标签页打开）")}
            >${t("Docs: Control UI auth", "文档：Control UI 鉴权")}</a
          >
        </div>
      </div>
    `;
  })();

  const insecureContextHint = (() => {
    if (props.connected || !props.lastError) {
      return null;
    }
    const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : true;
    if (isSecureContext) {
      return null;
    }
    const lower = props.lastError.toLowerCase();
    if (!lower.includes("secure context") && !lower.includes("device identity required")) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t(
          "This page is HTTP, so the browser blocks device identity. Use HTTPS (Tailscale Serve) or open",
          "当前页面是 HTTP，浏览器会阻止设备身份。请使用 HTTPS（Tailscale Serve）或在网关主机打开",
        )}
        <span class="mono">http://127.0.0.1:18789</span>.
        <div style="margin-top: 6px">
          ${t("If you must stay on HTTP, set", "如果必须使用 HTTP，请设置")}
          <span class="mono">gateway.controlUi.allowInsecureAuth: true</span>
          ${t("(token-only).", "（仅 token）。")}
        </div>
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/gateway/tailscale"
            target="_blank"
            rel="noreferrer"
            title=${t("Tailscale Serve docs (opens in new tab)", "Tailscale Serve 文档（新标签页打开）")}
            >${t("Docs: Tailscale Serve", "文档：Tailscale Serve")}</a
          >
          <span class="muted"> / </span>
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/control-ui#insecure-http"
            target="_blank"
            rel="noreferrer"
            title=${t("Insecure HTTP docs (opens in new tab)", "不安全 HTTP 文档（新标签页打开）")}
            >${t("Docs: Insecure HTTP", "文档：不安全 HTTP")}</a
          >
        </div>
      </div>
    `;
  })();

  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">${t("Gateway Access", "网关连接")}</div>
        <div class="card-sub">
          ${t(
            "Where the dashboard connects and how it authenticates.",
            "控制台连接到哪里，以及如何进行鉴权。",
          )}
        </div>
        <div class="form-grid" style="margin-top: 16px;">
          <label class="field">
            <span>${t("WebSocket URL", "WebSocket 地址")}</span>
            <input
              .value=${props.settings.gatewayUrl}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSettingsChange({ ...props.settings, gatewayUrl: v });
              }}
              placeholder="ws://100.x.y.z:18789"
            />
          </label>
          <label class="field">
            <span>${t("Gateway Token", "网关 Token")}</span>
            <input
              .value=${props.settings.token}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSettingsChange({ ...props.settings, token: v });
              }}
              placeholder="OPENCLAW_GATEWAY_TOKEN"
            />
          </label>
          <label class="field">
            <span>${t("Password (not stored)", "密码（不保存）")}</span>
            <input
              type="password"
              .value=${props.password}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onPasswordChange(v);
              }}
              placeholder=${t("system or shared password", "系统密码或共享密码")}
            />
          </label>
          <label class="field">
            <span>${t("Default Session Key", "默认 Session Key")}</span>
            <input
              .value=${props.settings.sessionKey}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSessionKeyChange(v);
              }}
            />
          </label>
        </div>
        <div class="row" style="margin-top: 14px;">
          <button class="btn" @click=${() => props.onConnect()}>${t("Connect", "连接")}</button>
          <button class="btn" @click=${() => props.onRefresh()}>${t("Refresh", "刷新")}</button>
          <span class="muted">${t("Click Connect to apply connection changes.", "点击“连接”以应用连接配置。")}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">${t("Snapshot", "快照")}</div>
        <div class="card-sub">${t("Latest gateway handshake information.", "最近一次网关握手信息。")}</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">${t("Status", "状态")}</div>
            <div class="stat-value ${props.connected ? "ok" : "warn"}">
              ${props.connected ? t("Connected", "已连接") : t("Disconnected", "未连接")}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("Uptime", "运行时长")}</div>
            <div class="stat-value">${uptime}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("Tick Interval", "Tick 间隔")}</div>
            <div class="stat-value">${tick}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("Last Channels Refresh", "渠道上次刷新")}</div>
            <div class="stat-value">
              ${
                props.lastChannelsRefresh
                  ? formatRelativeTimestamp(props.lastChannelsRefresh)
                  : naLabel
              }
            </div>
          </div>
        </div>
        ${
          props.lastError
            ? html`<div class="callout danger" style="margin-top: 14px;">
              <div>${props.lastError}</div>
              ${authHint ?? ""}
              ${insecureContextHint ?? ""}
            </div>`
            : html`
                <div class="callout" style="margin-top: 14px">
                  ${t(
                    "Use Channels to link WhatsApp, Telegram, Discord, Signal, or iMessage.",
                    "在“渠道”页可连接 WhatsApp、Telegram、Discord、Signal 或 iMessage。",
                  )}
                </div>
              `
        }
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">${t("Workspace", "工作空间")}</div>
      <div class="card-sub">
        ${t(
          "Default agent workspace directory (config: agents.defaults.workspace).",
          "默认 agent 工作空间目录（配置：agents.defaults.workspace）。",
        )}
      </div>
      <div class="form-grid" style="margin-top: 16px;">
        <label class="field">
          <span>${t("Workspace Path", "工作空间路径")}</span>
          <input
            .value=${props.workspace}
            ?disabled=${!props.connected || props.workspaceLoading}
            @input=${(e: Event) => props.onWorkspaceChange((e.target as HTMLInputElement).value)}
            placeholder="~/openclaw"
          />
        </label>
      </div>
      <div class="row" style="margin-top: 14px;">
        <button
          class="btn"
          ?disabled=${!props.connected || props.workspaceLoading || props.workspaceSaving}
          @click=${() => props.onWorkspaceSave()}
          title=${t("Save config (no restart).", "保存配置（不重启）。")}
        >
          ${props.workspaceSaving ? t("Saving...", "保存中...") : t("Save", "保存")}
        </button>
        <button
          class="btn"
          ?disabled=${!props.connected || props.workspaceLoading || props.workspaceApplying}
          @click=${() => props.onWorkspaceApply()}
          title=${t("Apply config (gateway will restart).", "应用配置（网关将重启）。")}
        >
          ${
            props.workspaceApplying
              ? t("Applying...", "应用中...")
              : t("Apply (restart)", "应用（重启）")
          }
        </button>
        <span class="muted">
          ${
            props.workspaceDirty
              ? t("Unsaved config changes.", "有未保存的配置变更。")
              : t("Loaded from gateway config.", "已从网关配置加载。")
          }
        </span>
      </div>
      ${
        !props.connected
          ? html`<div class="muted" style="margin-top: 10px;">
              ${t(
                "Connect to the gateway to view and edit workspace settings.",
                "请先连接网关，才能查看和修改工作空间配置。",
              )}
            </div>`
          : ""
      }
    </section>

    <section class="grid grid-cols-3" style="margin-top: 18px;">
      <div class="card stat-card">
        <div class="stat-label">${t("Instances", "实例")}</div>
        <div class="stat-value">${props.presenceCount}</div>
        <div class="muted">${t("Presence beacons in the last 5 minutes.", "最近 5 分钟内的在线信标。")}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t("Sessions", "会话")}</div>
        <div class="stat-value">${props.sessionsCount ?? naLabel}</div>
        <div class="muted">${t("Recent session keys tracked by the gateway.", "网关最近追踪的会话键。")}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t("Cron", "定时任务")}</div>
        <div class="stat-value">
          ${
            props.cronEnabled == null
              ? naLabel
              : props.cronEnabled
                ? t("Enabled", "已启用")
                : t("Disabled", "已禁用")
          }
        </div>
        <div class="muted">
          ${t("Next wake", "下次唤醒")} ${formatNextRun(props.cronNext)}
        </div>
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">${t("Notes", "说明")}</div>
      <div class="card-sub">${t("Quick reminders for remote control setups.", "远程控制部署的快速提示。")}</div>
      <div class="note-grid" style="margin-top: 14px;">
        <div>
          <div class="note-title">${t("Tailscale serve", "Tailscale Serve")}</div>
          <div class="muted">
            ${t(
              "Prefer serve mode to keep the gateway on loopback with tailnet auth.",
              "优先使用 serve 模式，让网关只监听 loopback 并由 tailnet 鉴权。",
            )}
          </div>
        </div>
        <div>
          <div class="note-title">${t("Session hygiene", "会话清理")}</div>
          <div class="muted">${t("Use /new or sessions.patch to reset context.", "可用 /new 或 sessions.patch 重置上下文。")}</div>
        </div>
        <div>
          <div class="note-title">${t("Cron reminders", "定时提醒")}</div>
          <div class="muted">${t("Use isolated sessions for recurring runs.", "定时任务建议使用独立会话。")}</div>
        </div>
      </div>
    </section>
  `;
}

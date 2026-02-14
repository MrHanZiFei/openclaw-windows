import type { IconName } from "./icons.js";
import { pickLocaleText, type UiLocale } from "./i18n.ts";

export const TAB_GROUPS = [
  { label: "Chat", tabs: ["chat"] },
  {
    label: "Control",
    tabs: ["overview", "channels", "instances", "sessions", "usage", "cron"],
  },
  { label: "Agent", tabs: ["agents", "skills", "nodes"] },
  { label: "Settings", tabs: ["config", "configTable", "debug", "logs"] },
] as const;

export type Tab =
  | "agents"
  | "overview"
  | "channels"
  | "instances"
  | "sessions"
  | "usage"
  | "cron"
  | "skills"
  | "nodes"
  | "chat"
  | "config"
  | "configTable"
  | "debug"
  | "logs";

const TAB_PATHS: Record<Tab, string> = {
  agents: "/agents",
  overview: "/overview",
  channels: "/channels",
  instances: "/instances",
  sessions: "/sessions",
  usage: "/usage",
  cron: "/cron",
  skills: "/skills",
  nodes: "/nodes",
  chat: "/chat",
  config: "/config",
  configTable: "/config-table",
  debug: "/debug",
  logs: "/logs",
};

const PATH_TO_TAB = new Map(Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as Tab]));

export function normalizeBasePath(basePath: string): string {
  if (!basePath) {
    return "";
  }
  let base = basePath.trim();
  if (!base.startsWith("/")) {
    base = `/${base}`;
  }
  if (base === "/") {
    return "";
  }
  if (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  return base;
}

export function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }
  let normalized = path.trim();
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const path = TAB_PATHS[tab];
  return base ? `${base}${path}` : path;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const base = normalizeBasePath(basePath);
  let path = pathname || "/";
  if (base) {
    if (path === base) {
      path = "/";
    } else if (path.startsWith(`${base}/`)) {
      path = path.slice(base.length);
    }
  }
  let normalized = normalizePath(path).toLowerCase();
  if (normalized.endsWith("/index.html")) {
    normalized = "/";
  }
  if (normalized === "/") {
    return "chat";
  }
  return PATH_TO_TAB.get(normalized) ?? null;
}

export function inferBasePathFromPathname(pathname: string): string {
  let normalized = normalizePath(pathname);
  if (normalized.endsWith("/index.html")) {
    normalized = normalizePath(normalized.slice(0, -"/index.html".length));
  }
  if (normalized === "/") {
    return "";
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "";
  }
  for (let i = 0; i < segments.length; i++) {
    const candidate = `/${segments.slice(i).join("/")}`.toLowerCase();
    if (PATH_TO_TAB.has(candidate)) {
      const prefix = segments.slice(0, i);
      return prefix.length ? `/${prefix.join("/")}` : "";
    }
  }
  return `/${segments.join("/")}`;
}

export function iconForTab(tab: Tab): IconName {
  switch (tab) {
    case "agents":
      return "folder";
    case "chat":
      return "messageSquare";
    case "overview":
      return "barChart";
    case "channels":
      return "link";
    case "instances":
      return "radio";
    case "sessions":
      return "fileText";
    case "usage":
      return "barChart";
    case "cron":
      return "loader";
    case "skills":
      return "zap";
    case "nodes":
      return "monitor";
    case "config":
      return "settings";
    case "configTable":
      return "settings";
    case "debug":
      return "bug";
    case "logs":
      return "scrollText";
    default:
      return "folder";
  }
}

export function titleForTab(tab: Tab) {
  return titleForTabWithLocale(tab, "en");
}

export function titleForTabWithLocale(tab: Tab, locale: UiLocale) {
  switch (tab) {
    case "agents":
      return pickLocaleText(locale, "Agents", "代理");
    case "overview":
      return pickLocaleText(locale, "Overview", "总览");
    case "channels":
      return pickLocaleText(locale, "Channels", "渠道");
    case "instances":
      return pickLocaleText(locale, "Instances", "实例");
    case "sessions":
      return pickLocaleText(locale, "Sessions", "会话");
    case "usage":
      return pickLocaleText(locale, "Usage", "用量");
    case "cron":
      return pickLocaleText(locale, "Cron Jobs", "定时任务");
    case "skills":
      return pickLocaleText(locale, "Skills", "技能");
    case "nodes":
      return pickLocaleText(locale, "Nodes", "节点");
    case "chat":
      return pickLocaleText(locale, "Chat", "对话");
    case "config":
      return pickLocaleText(locale, "Config", "配置");
    case "configTable":
      return pickLocaleText(locale, "Config (Table)", "配置表");
    case "debug":
      return pickLocaleText(locale, "Debug", "调试");
    case "logs":
      return pickLocaleText(locale, "Logs", "日志");
    default:
      return pickLocaleText(locale, "Control", "控制台");
  }
}

export function subtitleForTab(tab: Tab) {
  return subtitleForTabWithLocale(tab, "en");
}

export function subtitleForTabWithLocale(tab: Tab, locale: UiLocale) {
  switch (tab) {
    case "agents":
      return pickLocaleText(
        locale,
        "Manage agent workspaces, tools, and identities.",
        "管理代理工作区、工具和身份。",
      );
    case "overview":
      return pickLocaleText(
        locale,
        "Gateway status, entry points, and a fast health read.",
        "网关状态、入口与健康概览。",
      );
    case "channels":
      return pickLocaleText(locale, "Manage channels and settings.", "管理渠道及其配置。");
    case "instances":
      return pickLocaleText(
        locale,
        "Presence beacons from connected clients and nodes.",
        "查看已连接客户端和节点的在线信标。",
      );
    case "sessions":
      return pickLocaleText(
        locale,
        "Inspect active sessions and adjust per-session defaults.",
        "查看活跃会话并调整会话级默认配置。",
      );
    case "usage":
      return "";
    case "cron":
      return pickLocaleText(
        locale,
        "Schedule wakeups and recurring agent runs.",
        "安排唤醒任务和周期性代理运行。",
      );
    case "skills":
      return pickLocaleText(
        locale,
        "Manage skill availability and API key injection.",
        "管理技能可用性与 API Key 注入。",
      );
    case "nodes":
      return pickLocaleText(
        locale,
        "Paired devices, capabilities, and command exposure.",
        "查看已配对设备、能力和命令暴露。",
      );
    case "chat":
      return pickLocaleText(
        locale,
        "Direct gateway chat session for quick interventions.",
        "与网关直接对话，快速干预处理。",
      );
    case "config":
      return pickLocaleText(
        locale,
        "Edit ~/.openclaw/openclaw.json safely.",
        "安全编辑 ~/.openclaw/openclaw.json。",
      );
    case "configTable":
      return pickLocaleText(
        locale,
        "Edit models.providers in a table (baseUrl/api/apiKey) and apply globally.",
        "用表格编辑 models.providers（baseUrl/api/apiKey），并全局应用生效。",
      );
    case "debug":
      return pickLocaleText(
        locale,
        "Gateway snapshots, events, and manual RPC calls.",
        "查看网关快照、事件和手动 RPC 调用。",
      );
    case "logs":
      return pickLocaleText(
        locale,
        "Live tail of the gateway file logs.",
        "实时查看网关日志文件。",
      );
    default:
      return "";
  }
}

export function groupLabelForTabGroup(label: string, locale: UiLocale): string {
  if (locale !== "zh-CN") {
    return label;
  }
  switch (label) {
    case "Chat":
      return "对话";
    case "Control":
      return "控制";
    case "Agent":
      return "代理";
    case "Settings":
      return "设置";
    default:
      return label;
  }
}

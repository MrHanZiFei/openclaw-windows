export type UiLocale = "en" | "zh-CN";

const DEFAULT_LOCALE: UiLocale = "en";

export function normalizeLocale(value: unknown): UiLocale {
  if (typeof value !== "string") {
    return DEFAULT_LOCALE;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_LOCALE;
  }
  if (normalized.startsWith("zh")) {
    return "zh-CN";
  }
  return DEFAULT_LOCALE;
}

export function detectBrowserLocale(): UiLocale {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }
  return normalizeLocale(navigator.language);
}

export function pickLocaleText(locale: UiLocale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}

import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { describe, expect, it } from "vitest";
import { resolveFeishuAccount } from "./accounts.js";

describe("resolveFeishuAccount", () => {
  it("falls back to configured default account when accountId is omitted", () => {
    const cfg = {
      channels: {
        feishu: {
          accounts: {
            main: {
              appId: "cli_main",
              appSecret: "secret_main",
            },
          },
        },
      },
    } as ClawdbotConfig;

    const account = resolveFeishuAccount({ cfg });

    expect(account.accountId).toBe("main");
    expect(account.configured).toBe(true);
    expect(account.appId).toBe("cli_main");
  });

  it("falls back to configured default account when accountId is explicitly default", () => {
    const cfg = {
      channels: {
        feishu: {
          accounts: {
            main: {
              appId: "cli_main",
              appSecret: "secret_main",
            },
          },
        },
      },
    } as ClawdbotConfig;

    const account = resolveFeishuAccount({ cfg, accountId: "default" });

    expect(account.accountId).toBe("main");
    expect(account.configured).toBe(true);
    expect(account.appId).toBe("cli_main");
  });

  it("keeps explicit non-default account ids without fallback", () => {
    const cfg = {
      channels: {
        feishu: {
          accounts: {
            main: {
              appId: "cli_main",
              appSecret: "secret_main",
            },
          },
        },
      },
    } as ClawdbotConfig;

    const account = resolveFeishuAccount({ cfg, accountId: "unknown" });

    expect(account.accountId).toBe("unknown");
    expect(account.configured).toBe(false);
  });

  it("keeps default account when top-level credentials are configured", () => {
    const cfg = {
      channels: {
        feishu: {
          appId: "cli_default",
          appSecret: "secret_default",
          accounts: {
            main: {
              appId: "cli_main",
              appSecret: "secret_main",
            },
          },
        },
      },
    } as ClawdbotConfig;

    const account = resolveFeishuAccount({ cfg, accountId: "default" });

    expect(account.accountId).toBe("default");
    expect(account.configured).toBe(true);
    expect(account.appId).toBe("cli_default");
  });
});

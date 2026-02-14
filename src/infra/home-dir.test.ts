import path from "node:path";
import { describe, expect, it } from "vitest";
import { expandHomePrefix, resolveEffectiveHomeDir, resolveRequiredHomeDir } from "./home-dir.js";

describe("resolveEffectiveHomeDir", () => {
  it("ignores OPENCLAW_HOME and prefers HOME over USERPROFILE", () => {
    const env = {
      OPENCLAW_HOME: "/srv/openclaw-home",
      HOME: "/home/other",
      USERPROFILE: "C:/Users/other",
    } as NodeJS.ProcessEnv;

    expect(resolveEffectiveHomeDir(env, () => "/fallback")).toBe(path.resolve("/home/other"));
  });

  it("falls back to HOME then USERPROFILE then homedir", () => {
    expect(resolveEffectiveHomeDir({ HOME: "/home/alice" } as NodeJS.ProcessEnv)).toBe(
      path.resolve("/home/alice"),
    );
    expect(resolveEffectiveHomeDir({ USERPROFILE: "C:/Users/alice" } as NodeJS.ProcessEnv)).toBe(
      path.resolve("C:/Users/alice"),
    );
    expect(resolveEffectiveHomeDir({} as NodeJS.ProcessEnv, () => "/fallback")).toBe(
      path.resolve("/fallback"),
    );
  });

  it("uses HOME for tilde expansion in env values", () => {
    const env = { HOME: "/home/alice" } as NodeJS.ProcessEnv;
    expect(resolveEffectiveHomeDir(env)).toBe(path.resolve("/home/alice"));
  });
});

describe("resolveRequiredHomeDir", () => {
  it("returns cwd when no home source is available", () => {
    expect(
      resolveRequiredHomeDir({} as NodeJS.ProcessEnv, () => {
        throw new Error("no home");
      }),
    ).toBe(process.cwd());
  });

  it("returns a fully resolved path for HOME", () => {
    const result = resolveRequiredHomeDir({ HOME: "/custom/home" } as NodeJS.ProcessEnv, () => {
      throw new Error("no home");
    });
    expect(result).toBe(path.resolve("/custom/home"));
  });
});

describe("expandHomePrefix", () => {
  it("expands tilde using effective home", () => {
    const value = expandHomePrefix("~/x", {
      env: { HOME: "/srv/openclaw-home" } as NodeJS.ProcessEnv,
    });
    expect(value).toBe(`${path.resolve("/srv/openclaw-home")}/x`);
  });

  it("keeps non-tilde values unchanged", () => {
    expect(expandHomePrefix("/tmp/x")).toBe("/tmp/x");
  });
});

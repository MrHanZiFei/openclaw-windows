import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  moveMediaFileToWorkspaceScreenshotDir,
  resolveWorkspaceScreenshotDateDir,
} from "./workspace-screenshots.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workspace-shots-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }),
  );
});

describe("workspace screenshot paths", () => {
  it("resolves workspace screenshot directory with date folder", async () => {
    const workspace = await makeTempDir();
    const resolved = resolveWorkspaceScreenshotDateDir({
      workspaceDir: workspace,
      date: new Date("2026-02-19T10:20:30"),
    });
    expect(resolved).toBe(path.join(workspace, "screenshots", "2026-02-19"));
  });

  it("moves screenshot file into workspace dated folder", async () => {
    const workspace = await makeTempDir();
    const sourceDir = await makeTempDir();
    const source = path.join(sourceDir, "shot.png");
    await fs.writeFile(source, Buffer.from("png"));

    const moved = await moveMediaFileToWorkspaceScreenshotDir({
      sourcePath: source,
      workspaceDir: workspace,
      date: new Date("2026-02-19T10:20:30"),
    });

    expect(moved.moved).toBe(true);
    expect(moved.path).toBe(path.join(workspace, "screenshots", "2026-02-19", "shot.png"));
    await expect(fs.stat(moved.path)).resolves.toBeTruthy();
    await expect(fs.stat(source)).rejects.toThrow();
  });

  it("falls back to original path when source file is missing", async () => {
    const workspace = await makeTempDir();
    const missing = path.join(workspace, "missing.png");
    const moved = await moveMediaFileToWorkspaceScreenshotDir({
      sourcePath: missing,
      workspaceDir: workspace,
      date: new Date("2026-02-19T10:20:30"),
    });

    expect(moved.moved).toBe(false);
    expect(moved.path).toBe(missing);
  });
});

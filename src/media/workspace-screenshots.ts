import fs from "node:fs/promises";
import path from "node:path";

export const WORKSPACE_SCREENSHOTS_DIRNAME = "screenshots";

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatDateFolder(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function resolveWorkspaceScreenshotDateDir(params: {
  workspaceDir: string;
  date?: Date;
}): string {
  const workspaceDir = params.workspaceDir.trim();
  if (!workspaceDir) {
    throw new Error("workspaceDir is required");
  }
  return path.join(
    workspaceDir,
    WORKSPACE_SCREENSHOTS_DIRNAME,
    formatDateFolder(params.date ?? new Date()),
  );
}

async function moveAcrossVolumes(sourcePath: string, targetPath: string): Promise<void> {
  await fs.copyFile(sourcePath, targetPath);
  await fs.unlink(sourcePath).catch(() => {});
}

export async function moveMediaFileToWorkspaceScreenshotDir(params: {
  sourcePath: string;
  workspaceDir: string;
  date?: Date;
}): Promise<{ path: string; moved: boolean }> {
  const sourcePath = params.sourcePath.trim();
  if (!sourcePath) {
    throw new Error("sourcePath is required");
  }
  const workspaceDir = params.workspaceDir.trim();
  if (!workspaceDir) {
    throw new Error("workspaceDir is required");
  }

  const targetDir = resolveWorkspaceScreenshotDateDir({
    workspaceDir,
    date: params.date,
  });
  await fs.mkdir(targetDir, { recursive: true, mode: 0o700 });
  const targetPath = path.join(targetDir, path.basename(sourcePath));

  try {
    await fs.rename(sourcePath, targetPath);
    return { path: targetPath, moved: true };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EXDEV") {
      await moveAcrossVolumes(sourcePath, targetPath);
      return { path: targetPath, moved: true };
    }
    if (code === "ENOENT") {
      // Keep browser tests stable when media store is mocked and the temp file doesn't exist.
      return { path: sourcePath, moved: false };
    }
    return { path: sourcePath, moved: false };
  }
}

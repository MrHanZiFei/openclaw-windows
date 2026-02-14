import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseScreenRecordPayload,
  parseScreenSnapshotPayload,
  screenRecordTempPath,
  screenSnapshotTempPath,
} from "./nodes-screen.js";

describe("nodes screen helpers", () => {
  it("parses screen.record payload", () => {
    const payload = parseScreenRecordPayload({
      format: "mp4",
      base64: "Zm9v",
      durationMs: 1000,
      fps: 12,
      screenIndex: 0,
      hasAudio: true,
    });
    expect(payload.format).toBe("mp4");
    expect(payload.base64).toBe("Zm9v");
    expect(payload.durationMs).toBe(1000);
    expect(payload.fps).toBe(12);
    expect(payload.screenIndex).toBe(0);
    expect(payload.hasAudio).toBe(true);
  });

  it("rejects invalid screen.record payload", () => {
    expect(() => parseScreenRecordPayload({ format: "mp4" })).toThrow(
      /invalid screen\.record payload/i,
    );
  });

  it("parses screen.snapshot payload", () => {
    const payload = parseScreenSnapshotPayload({
      format: "png",
      base64: "Zm9v",
      width: 1920,
      height: 1080,
      screenIndex: 0,
    });
    expect(payload).toEqual({
      format: "png",
      base64: "Zm9v",
      width: 1920,
      height: 1080,
      screenIndex: 0,
    });
  });

  it("rejects invalid screen.snapshot payload", () => {
    expect(() => parseScreenSnapshotPayload({ format: "png" })).toThrow(
      /invalid screen\.snapshot payload/i,
    );
  });

  it("builds screen record temp path", () => {
    const p = screenRecordTempPath({
      ext: "mp4",
      tmpDir: "/tmp",
      id: "id1",
    });
    expect(p).toBe(path.join("/tmp", "openclaw-screen-record-id1.mp4"));
  });

  it("builds screen snapshot temp path", () => {
    const p = screenSnapshotTempPath({
      ext: "png",
      tmpDir: "/tmp",
      id: "id2",
    });
    expect(p).toBe(path.join("/tmp", "openclaw-screen-snapshot-id2.png"));
  });
});

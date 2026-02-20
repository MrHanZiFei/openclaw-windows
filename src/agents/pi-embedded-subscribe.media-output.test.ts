import { describe, expect, it, vi } from "vitest";
import { subscribeEmbeddedPiSession } from "./pi-embedded-subscribe.js";

describe("subscribeEmbeddedPiSession media tool output", () => {
  it("keeps MEDIA directives as media payloads in verbose full mode", () => {
    let handler: ((evt: unknown) => void) | undefined;
    const session = {
      subscribe: (fn: (evt: unknown) => void) => {
        handler = fn;
        return () => {};
      },
    } as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"];

    const onToolResult = vi.fn();

    subscribeEmbeddedPiSession({
      session,
      runId: "run-media-output",
      verboseLevel: "full",
      onToolResult,
    });

    handler?.({
      type: "tool_execution_start",
      toolName: "nodes",
      toolCallId: "tc-media",
      args: { action: "screen_snapshot" },
    });
    handler?.({
      type: "tool_execution_end",
      toolName: "nodes",
      toolCallId: "tc-media",
      isError: false,
      result: {
        content: [{ type: "text", text: "MEDIA:/tmp/screenshot.png" }],
      },
    });

    const mediaPayload = onToolResult.mock.calls
      .map((call) => call[0] as { text?: string; mediaUrls?: string[] } | undefined)
      .find((payload) => payload?.mediaUrls?.includes("/tmp/screenshot.png"));

    expect(mediaPayload).toBeDefined();
    expect(mediaPayload?.text).not.toContain("MEDIA:/tmp/screenshot.png");
  });
});

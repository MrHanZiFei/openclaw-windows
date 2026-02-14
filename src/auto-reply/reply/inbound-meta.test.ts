import { describe, expect, it } from "vitest";
import type { TemplateContext } from "../templating.js";
import { buildInboundUserContextPrefix } from "./inbound-meta.js";

describe("buildInboundUserContextPrefix", () => {
  it("omits conversation info block", () => {
    const ctx = {
      ChatType: "direct",
      ConversationLabel: "ou_096aaf...",
      GroupSubject: "Some Group",
      GroupChannel: "channel",
      GroupSpace: "space",
      ThreadLabel: "thread",
      WasMentioned: true,
      IsForum: true,
    } as unknown as TemplateContext;

    const out = buildInboundUserContextPrefix(ctx);
    expect(out).not.toContain("Conversation info (untrusted metadata):");
    expect(out).not.toContain("conversation_label");
  });

  it("keeps sender info block for non-DM", () => {
    const ctx = {
      ChatType: "group",
      SenderName: "Alice",
    } as unknown as TemplateContext;

    const out = buildInboundUserContextPrefix(ctx);
    expect(out).toContain("Sender (untrusted metadata):");
    expect(out).toContain("Alice");
  });
});

import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { shortenHomePath } from "../../utils.js";
import {
  parseScreenRecordPayload,
  parseScreenSnapshotPayload,
  screenRecordTempPath,
  screenSnapshotTempPath,
  writeScreenRecordToFile,
  writeScreenSnapshotToFile,
} from "../nodes-screen.js";
import { parseDurationMs } from "../parse-duration.js";
import { runNodesCommand } from "./cli-utils.js";
import { buildNodeInvokeParams, callGatewayCli, nodesCallOpts, resolveNodeId } from "./rpc.js";
import type { NodesRpcOpts } from "./types.js";

export function registerNodesScreenCommands(nodes: Command) {
  const screen = nodes
    .command("screen")
    .description("Capture screen snapshots and recordings from a paired node");

  nodesCallOpts(
    screen
      .command("snapshot")
      .description("Capture a screen snapshot from a node (prints MEDIA:<path>)")
      .requiredOption("--node <idOrNameOrIp>", "Node id, name, or IP")
      .option("--format <png|jpg|jpeg>", "Image format", "png")
      .option("--screen <index>", "Screen index (0 = primary)", "0")
      .option("--out <path>", "Output path")
      .option("--invoke-timeout <ms>", "Node invoke timeout in ms (default 20000)", "20000")
      .action(async (opts: NodesRpcOpts & { out?: string }) => {
        await runNodesCommand("screen snapshot", async () => {
          const nodeId = await resolveNodeId(opts, String(opts.node ?? ""));
          const formatOpt = String(opts.format ?? "png")
            .trim()
            .toLowerCase();
          const formatForParams =
            formatOpt === "jpg" ? "jpeg" : formatOpt === "jpeg" ? "jpeg" : "png";
          if (formatForParams !== "png" && formatForParams !== "jpeg") {
            throw new Error(`invalid format: ${String(opts.format)} (expected png|jpg|jpeg)`);
          }
          const screenIndex = Number.parseInt(String(opts.screen ?? "0"), 10);
          const timeoutMs = opts.invokeTimeout
            ? Number.parseInt(String(opts.invokeTimeout), 10)
            : undefined;

          const invokeParams: Record<string, unknown> = {
            nodeId,
            command: "screen.snapshot",
            params: {
              format: formatForParams,
              screenIndex: Number.isFinite(screenIndex) ? screenIndex : undefined,
            },
            idempotencyKey: randomIdempotencyKey(),
          };
          if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs)) {
            invokeParams.timeoutMs = timeoutMs;
          }

          const raw = await callGatewayCli("node.invoke", opts, invokeParams);
          const res = typeof raw === "object" && raw !== null ? (raw as { payload?: unknown }) : {};
          const payload = parseScreenSnapshotPayload(res.payload);
          const ext = payload.format === "jpeg" ? "jpg" : payload.format;
          const filePath = opts.out ?? screenSnapshotTempPath({ ext });
          const written = await writeScreenSnapshotToFile(filePath, payload.base64);

          if (opts.json) {
            defaultRuntime.log(
              JSON.stringify(
                {
                  file: {
                    path: written.path,
                    format: payload.format,
                    width: payload.width,
                    height: payload.height,
                    screenIndex: payload.screenIndex,
                  },
                },
                null,
                2,
              ),
            );
            return;
          }
          defaultRuntime.log(`MEDIA:${shortenHomePath(written.path)}`);
        });
      }),
    { timeoutMs: 60_000 },
  );

  nodesCallOpts(
    screen
      .command("record")
      .description("Capture a short screen recording from a node (prints MEDIA:<path>)")
      .requiredOption("--node <idOrNameOrIp>", "Node id, name, or IP")
      .option("--screen <index>", "Screen index (0 = primary)", "0")
      .option("--duration <ms|10s>", "Clip duration (ms or 10s)", "10000")
      .option("--fps <fps>", "Frames per second", "10")
      .option("--no-audio", "Disable microphone audio capture")
      .option("--out <path>", "Output path")
      .option("--invoke-timeout <ms>", "Node invoke timeout in ms (default 120000)", "120000")
      .action(async (opts: NodesRpcOpts & { out?: string }) => {
        await runNodesCommand("screen record", async () => {
          const nodeId = await resolveNodeId(opts, String(opts.node ?? ""));
          const durationMs = parseDurationMs(opts.duration ?? "");
          const screenIndex = Number.parseInt(String(opts.screen ?? "0"), 10);
          const fps = Number.parseFloat(String(opts.fps ?? "10"));
          const timeoutMs = opts.invokeTimeout
            ? Number.parseInt(String(opts.invokeTimeout), 10)
            : undefined;

          const invokeParams = buildNodeInvokeParams({
            nodeId,
            command: "screen.record",
            params: {
              durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
              screenIndex: Number.isFinite(screenIndex) ? screenIndex : undefined,
              fps: Number.isFinite(fps) ? fps : undefined,
              format: "mp4",
              includeAudio: opts.audio !== false,
            },
            timeoutMs,
          });

          const raw = await callGatewayCli("node.invoke", opts, invokeParams);
          const res = typeof raw === "object" && raw !== null ? (raw as { payload?: unknown }) : {};
          const parsed = parseScreenRecordPayload(res.payload);
          const filePath = opts.out ?? screenRecordTempPath({ ext: parsed.format || "mp4" });
          const written = await writeScreenRecordToFile(filePath, parsed.base64);

          if (opts.json) {
            defaultRuntime.log(
              JSON.stringify(
                {
                  file: {
                    path: written.path,
                    durationMs: parsed.durationMs,
                    fps: parsed.fps,
                    screenIndex: parsed.screenIndex,
                    hasAudio: parsed.hasAudio,
                  },
                },
                null,
                2,
              ),
            );
            return;
          }
          defaultRuntime.log(`MEDIA:${shortenHomePath(written.path)}`);
        });
      }),
    { timeoutMs: 180_000 },
  );
}

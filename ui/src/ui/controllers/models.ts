import type { GatewayBrowserClient } from "../gateway.ts";

export type ModelsProbeState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  modelsProbeByProvider: Record<string, unknown>;
  modelsProbeBusyByProvider: Record<string, boolean>;
};

export async function probeModelProvider(
  state: ModelsProbeState,
  providerId: string,
  opts?: { modelId?: string; timeoutMs?: number },
) {
  if (!state.client || !state.connected) {
    return;
  }

  const provider = providerId.trim();
  if (!provider) {
    return;
  }

  if (state.modelsProbeBusyByProvider[provider]) {
    return;
  }

  state.modelsProbeBusyByProvider = { ...state.modelsProbeBusyByProvider, [provider]: true };
  try {
    const res = await state.client.request("models.probe", {
      provider,
      modelId: opts?.modelId,
      timeoutMs: opts?.timeoutMs,
    });
    state.modelsProbeByProvider = { ...state.modelsProbeByProvider, [provider]: res };
  } catch (err) {
    const raw = String(err);
    const hint = raw.includes("unknown method: models.probe")
      ? "Gateway does not support models.probe. Restart/upgrade the gateway and retry."
      : raw;
    state.modelsProbeByProvider = {
      ...state.modelsProbeByProvider,
      [provider]: { provider, status: "unknown", error: hint, ts: Date.now() },
    };
  } finally {
    state.modelsProbeBusyByProvider = { ...state.modelsProbeBusyByProvider, [provider]: false };
  }
}

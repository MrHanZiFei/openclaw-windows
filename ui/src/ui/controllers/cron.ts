import type { GatewayBrowserClient } from "../gateway.ts";
import type { CronJob, CronRunLogEntry, CronStatus } from "../types.ts";
import type { CronFormState } from "../ui-types.ts";
import { DEFAULT_CRON_FORM } from "../app-defaults.ts";
import { toNumber } from "../format.ts";

export type CronState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  cronLoading: boolean;
  cronJobs: CronJob[];
  cronStatus: CronStatus | null;
  cronError: string | null;
  cronForm: CronFormState;
  cronEditingJobId?: string | null;
  cronRunsJobId: string | null;
  cronRuns: CronRunLogEntry[];
  cronBusy: boolean;
};

export async function loadCronStatus(state: CronState) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const res = await state.client.request<CronStatus>("cron.status", {});
    state.cronStatus = res;
  } catch (err) {
    state.cronError = String(err);
  }
}

export async function loadCronJobs(state: CronState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.cronLoading) {
    return;
  }
  state.cronLoading = true;
  state.cronError = null;
  try {
    const res = await state.client.request<{ jobs?: Array<CronJob> }>("cron.list", {
      includeDisabled: true,
    });
    state.cronJobs = Array.isArray(res.jobs) ? res.jobs : [];
    if (
      state.cronEditingJobId &&
      !state.cronJobs.some((job) => job.id === state.cronEditingJobId)
    ) {
      state.cronEditingJobId = null;
    }
  } catch (err) {
    state.cronError = String(err);
  } finally {
    state.cronLoading = false;
  }
}

function formatDateTimeLocal(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return "";
  }
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resolveEveryForm(everyMs: number): {
  everyAmount: string;
  everyUnit: CronFormState["everyUnit"];
} {
  if (everyMs % 86_400_000 === 0) {
    return { everyAmount: String(everyMs / 86_400_000), everyUnit: "days" };
  }
  if (everyMs % 3_600_000 === 0) {
    return { everyAmount: String(everyMs / 3_600_000), everyUnit: "hours" };
  }
  if (everyMs % 60_000 === 0) {
    return { everyAmount: String(everyMs / 60_000), everyUnit: "minutes" };
  }
  return {
    everyAmount: String(Number((everyMs / 60_000).toFixed(4))),
    everyUnit: "minutes",
  };
}

export function cronFormFromJob(job: CronJob): CronFormState {
  const base: CronFormState = {
    ...DEFAULT_CRON_FORM,
    name: job.name,
    description: job.description ?? "",
    agentId: job.agentId ?? "",
    enabled: job.enabled,
    sessionTarget: job.sessionTarget,
    wakeMode: job.wakeMode,
  };

  if (job.schedule.kind === "at") {
    base.scheduleKind = "at";
    base.scheduleAt = formatDateTimeLocal(job.schedule.at);
  } else if (job.schedule.kind === "every") {
    base.scheduleKind = "every";
    const every = resolveEveryForm(job.schedule.everyMs);
    base.everyAmount = every.everyAmount;
    base.everyUnit = every.everyUnit;
  } else {
    base.scheduleKind = "cron";
    base.cronExpr = job.schedule.expr;
    base.cronTz = job.schedule.tz ?? "";
  }

  if (job.payload.kind === "systemEvent") {
    base.payloadKind = "systemEvent";
    base.payloadText = job.payload.text;
    base.timeoutSeconds = "";
  } else {
    base.payloadKind = "agentTurn";
    base.payloadText = job.payload.message;
    base.timeoutSeconds =
      typeof job.payload.timeoutSeconds === "number" ? String(job.payload.timeoutSeconds) : "";
  }

  base.deliveryMode = job.delivery?.mode === "none" ? "none" : "announce";
  base.deliveryChannel = job.delivery?.channel ?? "last";
  base.deliveryTo = job.delivery?.to ?? "";
  return base;
}

export function startCronJobEdit(state: CronState, job: CronJob) {
  state.cronEditingJobId = job.id;
  state.cronForm = cronFormFromJob(job);
  state.cronError = null;
}

export function cancelCronJobEdit(state: CronState) {
  state.cronEditingJobId = null;
  state.cronForm = { ...DEFAULT_CRON_FORM };
}

export function buildCronSchedule(form: CronFormState) {
  if (form.scheduleKind === "at") {
    const ms = Date.parse(form.scheduleAt);
    if (!Number.isFinite(ms)) {
      throw new Error("Invalid run time.");
    }
    return { kind: "at" as const, at: new Date(ms).toISOString() };
  }
  if (form.scheduleKind === "every") {
    const amount = toNumber(form.everyAmount, 0);
    if (amount <= 0) {
      throw new Error("Invalid interval amount.");
    }
    const unit = form.everyUnit;
    const mult = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
    return { kind: "every" as const, everyMs: amount * mult };
  }
  const expr = form.cronExpr.trim();
  if (!expr) {
    throw new Error("Cron expression required.");
  }
  return { kind: "cron" as const, expr, tz: form.cronTz.trim() || undefined };
}

export function buildCronPayload(form: CronFormState) {
  if (form.payloadKind === "systemEvent") {
    const text = form.payloadText.trim();
    if (!text) {
      throw new Error("System event text required.");
    }
    return { kind: "systemEvent" as const, text };
  }
  const message = form.payloadText.trim();
  if (!message) {
    throw new Error("Agent message required.");
  }
  const payload: {
    kind: "agentTurn";
    message: string;
    timeoutSeconds?: number;
  } = { kind: "agentTurn", message };
  const timeoutSeconds = toNumber(form.timeoutSeconds, 0);
  if (timeoutSeconds > 0) {
    payload.timeoutSeconds = timeoutSeconds;
  }
  return payload;
}

export async function addCronJob(state: CronState) {
  if (!state.client || !state.connected || state.cronBusy) {
    return;
  }
  state.cronBusy = true;
  state.cronError = null;
  try {
    const schedule = buildCronSchedule(state.cronForm);
    const payload = buildCronPayload(state.cronForm);
    const delivery =
      state.cronForm.sessionTarget === "isolated" &&
      state.cronForm.payloadKind === "agentTurn" &&
      state.cronForm.deliveryMode
        ? {
            mode: state.cronForm.deliveryMode === "announce" ? "announce" : "none",
            channel: state.cronForm.deliveryChannel.trim() || "last",
            to: state.cronForm.deliveryTo.trim() || undefined,
          }
        : undefined;
    const agentId = state.cronForm.agentId.trim();
    const job = {
      name: state.cronForm.name.trim(),
      description: state.cronForm.description.trim() || undefined,
      agentId: agentId || undefined,
      enabled: state.cronForm.enabled,
      schedule,
      sessionTarget: state.cronForm.sessionTarget,
      wakeMode: state.cronForm.wakeMode,
      payload,
      delivery,
    };
    if (!job.name) {
      throw new Error("Name required.");
    }
    await state.client.request("cron.add", job);
    state.cronEditingJobId = null;
    state.cronForm = {
      ...state.cronForm,
      name: "",
      description: "",
      payloadText: "",
    };
    await loadCronJobs(state);
    await loadCronStatus(state);
  } catch (err) {
    state.cronError = String(err);
  } finally {
    state.cronBusy = false;
  }
}

export async function updateCronJob(state: CronState, jobId: string) {
  if (!state.client || !state.connected || state.cronBusy) {
    return;
  }
  state.cronBusy = true;
  state.cronError = null;
  try {
    const name = state.cronForm.name.trim();
    if (!name) {
      throw new Error("Name required.");
    }
    const schedule = buildCronSchedule(state.cronForm);
    const payload = buildCronPayload(state.cronForm);
    const patch: Record<string, unknown> = {
      name,
      description: state.cronForm.description.trim(),
      agentId: state.cronForm.agentId.trim() || null,
      enabled: state.cronForm.enabled,
      schedule,
      sessionTarget: state.cronForm.sessionTarget,
      wakeMode: state.cronForm.wakeMode,
      payload,
    };
    if (state.cronForm.sessionTarget === "isolated" && state.cronForm.payloadKind === "agentTurn") {
      patch.delivery = {
        mode: state.cronForm.deliveryMode === "announce" ? "announce" : "none",
        channel: state.cronForm.deliveryChannel.trim() || "last",
        to: state.cronForm.deliveryTo.trim() || undefined,
      };
    }
    await state.client.request("cron.update", { id: jobId, patch });
    state.cronEditingJobId = null;
    state.cronForm = { ...DEFAULT_CRON_FORM };
    await loadCronJobs(state);
    await loadCronStatus(state);
  } catch (err) {
    state.cronError = String(err);
  } finally {
    state.cronBusy = false;
  }
}

export async function toggleCronJob(state: CronState, job: CronJob, enabled: boolean) {
  if (!state.client || !state.connected || state.cronBusy) {
    return;
  }
  state.cronBusy = true;
  state.cronError = null;
  try {
    await state.client.request("cron.update", { id: job.id, patch: { enabled } });
    await loadCronJobs(state);
    await loadCronStatus(state);
  } catch (err) {
    state.cronError = String(err);
  } finally {
    state.cronBusy = false;
  }
}

export async function runCronJob(state: CronState, job: CronJob) {
  if (!state.client || !state.connected || state.cronBusy) {
    return;
  }
  state.cronBusy = true;
  state.cronError = null;
  try {
    await state.client.request("cron.run", { id: job.id, mode: "force" });
    await loadCronRuns(state, job.id);
  } catch (err) {
    state.cronError = String(err);
  } finally {
    state.cronBusy = false;
  }
}

export async function removeCronJob(state: CronState, job: CronJob) {
  if (!state.client || !state.connected || state.cronBusy) {
    return;
  }
  state.cronBusy = true;
  state.cronError = null;
  try {
    await state.client.request("cron.remove", { id: job.id });
    if (state.cronEditingJobId === job.id) {
      state.cronEditingJobId = null;
      state.cronForm = { ...DEFAULT_CRON_FORM };
    }
    if (state.cronRunsJobId === job.id) {
      state.cronRunsJobId = null;
      state.cronRuns = [];
    }
    await loadCronJobs(state);
    await loadCronStatus(state);
  } catch (err) {
    state.cronError = String(err);
  } finally {
    state.cronBusy = false;
  }
}

export async function loadCronRuns(state: CronState, jobId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const res = await state.client.request<{ entries?: Array<CronRunLogEntry> }>("cron.runs", {
      id: jobId,
      limit: 50,
    });
    state.cronRunsJobId = jobId;
    state.cronRuns = Array.isArray(res.entries) ? res.entries : [];
  } catch (err) {
    state.cronError = String(err);
  }
}

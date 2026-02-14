import { describe, expect, it, vi } from "vitest";
import type { CronJob } from "../types.ts";
import { DEFAULT_CRON_FORM } from "../app-defaults.ts";
import {
  cancelCronJobEdit,
  cronFormFromJob,
  startCronJobEdit,
  updateCronJob,
  type CronState,
} from "./cron.ts";

function createJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: "job-1",
    name: "Daily ping",
    enabled: true,
    createdAtMs: 0,
    updatedAtMs: 0,
    schedule: { kind: "cron", expr: "0 9 * * *", tz: "UTC" },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: { kind: "agentTurn", message: "hello", timeoutSeconds: 45 },
    delivery: { mode: "announce", channel: "telegram", to: "12345" },
    ...overrides,
  };
}

function createState(overrides: Partial<CronState> = {}): CronState {
  return {
    client: null,
    connected: true,
    cronLoading: false,
    cronJobs: [],
    cronStatus: null,
    cronError: null,
    cronForm: { ...DEFAULT_CRON_FORM },
    cronEditingJobId: null,
    cronRunsJobId: null,
    cronRuns: [],
    cronBusy: false,
    ...overrides,
  };
}

describe("cron controllers edit flow", () => {
  it("maps cron job fields into form state for editing", () => {
    const job = createJob();
    const form = cronFormFromJob(job);

    expect(form.name).toBe("Daily ping");
    expect(form.scheduleKind).toBe("cron");
    expect(form.cronExpr).toBe("0 9 * * *");
    expect(form.payloadKind).toBe("agentTurn");
    expect(form.payloadText).toBe("hello");
    expect(form.timeoutSeconds).toBe("45");
    expect(form.deliveryMode).toBe("announce");
    expect(form.deliveryChannel).toBe("telegram");
    expect(form.deliveryTo).toBe("12345");
  });

  it("starts and cancels edit mode", () => {
    const state = createState();
    const job = createJob({ id: "job-2", name: "Hourly task" });

    startCronJobEdit(state, job);
    expect(state.cronEditingJobId).toBe("job-2");
    expect(state.cronForm.name).toBe("Hourly task");

    cancelCronJobEdit(state);
    expect(state.cronEditingJobId).toBeNull();
    expect(state.cronForm).toEqual(DEFAULT_CRON_FORM);
  });

  it("submits cron.update and exits edit mode", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "cron.list") {
        return { jobs: [createJob({ id: "job-1", name: "Updated name" })] };
      }
      if (method === "cron.status") {
        return { enabled: true, jobs: 1, nextWakeAtMs: null };
      }
      return {};
    });
    const state = createState({
      client: { request } as unknown as CronState["client"],
      cronEditingJobId: "job-1",
      cronForm: {
        ...DEFAULT_CRON_FORM,
        name: "Updated name",
        description: "",
        agentId: "",
        sessionTarget: "isolated",
        payloadKind: "agentTurn",
        payloadText: "Run updated action",
        scheduleKind: "every",
        everyAmount: "15",
        everyUnit: "minutes",
        deliveryMode: "announce",
        deliveryChannel: "telegram",
        deliveryTo: "9988",
      },
    });

    await updateCronJob(state, "job-1");

    expect(request).toHaveBeenCalledWith("cron.update", {
      id: "job-1",
      patch: {
        name: "Updated name",
        description: "",
        agentId: null,
        enabled: true,
        schedule: { kind: "every", everyMs: 900000 },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: "Run updated action",
        },
        delivery: {
          mode: "announce",
          channel: "telegram",
          to: "9988",
        },
      },
    });
    expect(state.cronEditingJobId).toBeNull();
    expect(state.cronForm).toEqual(DEFAULT_CRON_FORM);
  });
});

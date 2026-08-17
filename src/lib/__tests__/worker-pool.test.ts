/**
 * Tests for the shared worker pool.
 *
 * The pool is the scheduling core of the caption and detection routes:
 * tasks are drained by a fixed number of workers, each pinned to its
 * own llama.cpp slot (slotId = worker index), with optional abort.
 */

import { describe, it, expect } from "bun:test";
import { runWorkerPool } from "@/lib/worker-pool";

describe("runWorkerPool", () => {
  it("processes every task", async () => {
    const seen: number[] = [];
    await runWorkerPool([1, 2, 3, 4, 5], 2, async (task) => {
      seen.push(task);
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("passes the worker index as slotId and keeps it stable per worker", async () => {
    const slots: number[] = [];
    await runWorkerPool([1, 2, 3, 4], 2, async (_task, slotId) => {
      slots.push(slotId);
    });
    // Two workers -> only slot 0 and 1 are ever used
    expect(new Set(slots)).toEqual(new Set([0, 1]));
    expect(slots.length).toBe(4);
  });

  it("never exceeds the requested concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runWorkerPool(
      [1, 2, 3, 4, 5, 6, 7, 8],
      3,
      async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
      }
    );
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("clamps concurrency to the task count", async () => {
    const slots = new Set<number>();
    await runWorkerPool([1], 8, async (_task, slotId) => {
      slots.add(slotId);
    });
    expect(slots).toEqual(new Set([0]));
  });

  it("resolves immediately for an empty task list", async () => {
    const called: unknown[] = [];
    await runWorkerPool([], 4, async (task: unknown) => {
      called.push(task);
    });
    expect(called).toEqual([]);
  });

  it("stops starting new work when the signal aborts", async () => {
    const controller = new AbortController();
    let processed = 0;
    await runWorkerPool(
      [1, 2, 3, 4, 5, 6],
      2,
      async () => {
        processed++;
        if (processed === 2) controller.abort();
      },
      controller.signal
    );
    // Workers in flight finish, but not all 6 tasks are started
    expect(processed).toBeLessThan(6);
    expect(processed).toBeGreaterThanOrEqual(2);
  });

  it("returns early without processing when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const called: unknown[] = [];
    await runWorkerPool(
      [1, 2],
      2,
      async (task: unknown) => {
        called.push(task);
      },
      controller.signal
    );
    expect(called).toEqual([]);
  });
});

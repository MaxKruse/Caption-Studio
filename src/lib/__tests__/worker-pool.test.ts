/**
 * Tests for the shared worker pool.
 *
 * The pool is the scheduling core of the caption and detection routes:
 * tasks are drained by a fixed number of workers, each pinned to its
 * own llama.cpp slot (slotId = worker index), with optional abort.
 */

import { describe, it, expect } from "bun:test";
import { runWorkerPool, runWorkerPoolStreaming } from "@/lib/worker-pool";
import { createSessionQueue } from "@/lib/session-queue";

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

// ---------------------------------------------------------------------------
// runWorkerPoolStreaming
// ---------------------------------------------------------------------------

describe("runWorkerPoolStreaming", () => {
  it("processes every item enqueued before draining completes", async () => {
    const queue = createSessionQueue<number>({ expected: 6 });
    for (let i = 0; i < 6; i++) queue.enqueue(i);

    const seen: number[] = [];
    await runWorkerPoolStreaming(queue, 2, async (task) => {
      seen.push(task);
    });
    expect(seen.sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(await queue.done).toBe("drained");
  });

  it("starts working on items that arrive while the pool runs", async () => {
    const queue = createSessionQueue<number>({ expected: 4, idleTimeoutMs: 5_000 });
    queue.enqueue(1);
    queue.enqueue(2);

    const seen: number[] = [];
    const pool = runWorkerPoolStreaming(queue, 2, async (task) => {
      seen.push(task);
      if (seen.length === 1) {
        // Second half of the batch "arrives" mid-flight
        queue.enqueue(3);
        queue.enqueue(4);
      }
      await new Promise((resolve) => setTimeout(resolve, 2));
    });
    await pool;
    expect(seen.sort()).toEqual([1, 2, 3, 4]);
    expect(await queue.done).toBe("drained");
  });

  it("never exceeds the requested concurrency", async () => {
    const queue = createSessionQueue<number>({ expected: 8 });
    for (let i = 0; i < 8; i++) queue.enqueue(i);

    let inFlight = 0;
    let maxInFlight = 0;
    await runWorkerPoolStreaming(
      queue,
      3,
      async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 3));
        inFlight--;
      }
    );
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("pins each worker to a stable slot id below concurrency", async () => {
    const queue = createSessionQueue<number>({ expected: 10 });
    for (let i = 0; i < 10; i++) queue.enqueue(i);

    const slots = new Set<number>();
    await runWorkerPoolStreaming(queue, 3, async (_task, slotId) => {
      slots.add(slotId);
    });
    expect([...slots].every((s) => s >= 0 && s < 3)).toBe(true);
    expect(slots.size).toBeGreaterThan(0);
  });

  it("stops pulling new items when the signal aborts", async () => {
    const queue = createSessionQueue<number>({ expected: 10 });
    for (let i = 0; i < 10; i++) queue.enqueue(i);
    const controller = new AbortController();

    let processed = 0;
    await runWorkerPoolStreaming(
      queue,
      2,
      async () => {
        processed++;
        if (processed === 2) controller.abort();
      },
      controller.signal
    );
    expect(processed).toBeLessThan(10);
    expect(processed).toBeGreaterThanOrEqual(2);
  });

  it("resolves immediately when already aborted", async () => {
    const queue = createSessionQueue<number>({ expected: 2 });
    queue.enqueue(1);
    queue.enqueue(2);
    const controller = new AbortController();
    controller.abort();

    const called: unknown[] = [];
    await runWorkerPoolStreaming(queue, 2, async (task) => {
      called.push(task);
    }, controller.signal);
    expect(called).toEqual([]);
  });
});

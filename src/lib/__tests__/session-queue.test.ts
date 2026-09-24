import { describe, it, expect, jest } from "bun:test";
import { createSessionQueue } from "@/lib/session-queue";

// ---------------------------------------------------------------------------
// createSessionQueue
//
// Feeds a worker pool from chunked uploads: items are enqueued as
// upload chunks arrive, workers drain via next(), and done resolves
// once every expected item has arrived and been processed.
// ---------------------------------------------------------------------------

describe("createSessionQueue", () => {
  it("delivers items in FIFO order to multiple consumers", async () => {
    const q = createSessionQueue<number>({ expected: 5 });
    for (let i = 0; i < 5; i++) q.enqueue(i);

    const seen: number[] = [];
    const drain = async () => {
      for (;;) {
        const item = await q.next();
        if (item === undefined) break;
        seen.push(item);
      }
    };
    await Promise.all([drain(), drain()]);
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(await q.done).toBe("drained");
  });

  it("resolves a waiting next() when an item arrives", async () => {
    const q = createSessionQueue<string>({ expected: 1 });
    const pending = q.next();
    q.enqueue("first");
    expect(await pending).toBe("first");
    expect(await q.done).toBe("drained");
  });

  it("done resolves 'drained' once all expected items arrived and were processed", async () => {
    const q = createSessionQueue<number>({ expected: 3 });
    q.enqueue(1);
    expect(await q.next()).toBe(1);
    // Not drained yet: 2 more expected
    q.enqueue(2);
    expect(await q.next()).toBe(2);
    q.enqueue(3);
    expect(await q.next()).toBe(3);
    expect(await q.done).toBe("drained");
  });

  it("next() resolves undefined once the queue is drained", async () => {
    const q = createSessionQueue<number>({ expected: 1 });
    q.enqueue(9);
    expect(await q.next()).toBe(9);
    expect(await q.done).toBe("drained");
    expect(await q.next()).toBeUndefined();
  });

  it("done resolves 'timed-out' when enqueues stop before the expected count", async () => {
    const q = createSessionQueue<number>({ expected: 10, idleTimeoutMs: 50 });
    q.enqueue(1);
    expect(await q.next()).toBe(1);

    const pending = q.next(); // waiter blocks past the timeout
    expect(await q.done).toBe("timed-out");
    expect(await pending).toBeUndefined();
  });

  it("does not time out once every expected item has arrived (backlog drains at its own pace)", async () => {
    jest.useFakeTimers();
    try {
      const q = createSessionQueue<number>({ expected: 3, idleTimeoutMs: 50 });
      q.enqueue(1);
      q.enqueue(2);
      q.enqueue(3); // all arrived - the idle timer must be cleared now

      // Advance past the idle window. Pre-fix this is where the timer fired
      // "timed-out" even though every item had already arrived.
      jest.advanceTimersByTime(150);

      // The backlog must still drain normally instead of timing out.
      expect(await q.next()).toBe(1);
      expect(await q.next()).toBe(2);
      expect(await q.next()).toBe(3);
      expect(await q.done).toBe("drained");
    } finally {
      jest.useRealTimers();
    }
  });

  it("abort() resolves done with 'aborted' and unblocks waiters", async () => {
    const q = createSessionQueue<number>({ expected: 10, idleTimeoutMs: 60_000 });
    q.enqueue(1);
    expect(await q.next()).toBe(1);

    const pending = q.next();
    q.abort();
    expect(await q.done).toBe("aborted");
    expect(await pending).toBeUndefined();
  });

  it("ignores late enqueues after the queue finished", async () => {
    const q = createSessionQueue<number>({ expected: 1 });
    q.enqueue(1);
    expect(await q.next()).toBe(1);
    expect(await q.done).toBe("drained");

    q.enqueue(2); // late chunk after completion
    expect(q.arrived).toBe(1);
    expect(await q.next()).toBeUndefined();
  });

  it("tracks arrived count", async () => {
    const q = createSessionQueue<number>({ expected: 3 });
    expect(q.arrived).toBe(0);
    q.enqueue(1);
    q.enqueue(2);
    expect(q.arrived).toBe(2);
    q.abort();
    await q.done;
  });

  it("reject() decrements the expected count so the queue drains", async () => {
    const q = createSessionQueue<number>({ expected: 5 });
    q.enqueue(1);
    expect(await q.next()).toBe(1);
    // Two of the remaining four will never arrive (rejected at upload)
    q.reject(2);
    expect(q.expected).toBe(3);
    q.enqueue(2);
    expect(await q.next()).toBe(2);
    q.enqueue(3);
    expect(await q.next()).toBe(3);
    expect(await q.done).toBe("drained");
  });

  it("reject() is a no-op once the queue finished", async () => {
    const q = createSessionQueue<number>({ expected: 1 });
    q.enqueue(1);
    expect(await q.next()).toBe(1);
    expect(await q.done).toBe("drained");
    q.reject(3);
    // State is frozen after finish: expected count unchanged
    expect(q.expected).toBe(1);
    expect(q.arrived).toBe(1);
  });

  it("reject() never drives the expected count below zero", async () => {
    const q = createSessionQueue<number>({ expected: 2 });
    q.reject(10);
    expect(q.expected).toBe(0);
    expect(await q.done).toBe("drained");
  });
});

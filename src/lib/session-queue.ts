/**
 * SessionQueue - bridges chunked uploads to a worker pool.
 *
 * In chunked mode the client sends images in N small POSTs; the first
 * chunk opens the SSE stream and workers must start consuming immediately
 * instead of waiting for the whole batch. SessionQueue is the
 * producer/consumer bridge:
 *
 * - enqueue(item) is called as each upload chunk arrives (resets the idle timer)
 * - workers call next() to pull the next item (blocks until one arrives)
 * - done resolves with "drained" once every expected item has arrived
 *   AND been consumed, "timed-out" if chunks stop arriving, or "aborted"
 *   when the caller aborts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueueOutcome = "drained" | "timed-out" | "aborted";

export interface SessionQueue<T> {
  /** Enqueue an item (from an arriving upload chunk). Resets the idle timer. */
  enqueue(item: T): void;
  /**
   * Record that `count` expected items were rejected before enqueue (e.g.
   * failed upload validation), decrementing the expected total. The queue
   * drains as soon as the remainder has arrived and been consumed, so the
   * idle timeout cannot fire falsely. No-op once finished.
   */
  reject(count: number): void;
  /**
   * Resolve the next item, or undefined once the queue is closed
   * (drained, timed out, or aborted) - workers stop pulling after that.
   */
  next(): Promise<T | undefined>;
  /** Resolves with the terminal outcome. */
  done: Promise<QueueOutcome>;
  /** Number of items enqueued so far. */
  readonly arrived: number;
  /** Total items still expected (client promise minus rejections). */
  readonly expected: number;
  /** Force-terminate with the "aborted" outcome. */
  abort(): void;
  /** Clear pending timers. Call once after done has resolved. */
  dispose(): void;
}

export interface SessionQueueOptions {
  /** Total number of items expected over the queue's lifetime. */
  expected: number;
  /**
   * If no item is enqueued for this long (and the expected count has not
   * been reached), the queue ends with "timed-out". Omit to disable.
   */
  idleTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createSessionQueue<T>(options: SessionQueueOptions): SessionQueue<T> {
  let expected = options.expected;
  const idleTimeoutMs = options.idleTimeoutMs;

  const pending: T[] = [];
  const waiters: Array<(item: T | undefined) => void> = [];
  let arrived = 0;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let doneResolve: (o: QueueOutcome) => void;

  const done = new Promise<QueueOutcome>((resolve) => {
    doneResolve = resolve;
  });

  const finish = (result: QueueOutcome): void => {
    if (finished) return;
    finished = true;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    // Unblock every current waiter; future next() calls resolve undefined
    for (const wake of waiters.splice(0)) wake(undefined);
    doneResolve(result);
  };

  /** Finish with "drained" once everything expected has been consumed. */
  const checkDrained = (): void => {
    if (!finished && arrived >= expected && pending.length === 0) {
      finish("drained");
    }
  };

  const armIdleTimer = (): void => {
    if (!idleTimeoutMs) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => finish("timed-out"), idleTimeoutMs);
  };

  const enqueue = (item: T): void => {
    if (finished) return; // late chunk after completion - ignore
    arrived++;
    if (waiters.length > 0) {
      const wake = waiters.shift()!;
      wake(item);
    } else {
      pending.push(item);
    }
    if (arrived >= expected && pending.length === 0) {
      finish("drained");
    } else {
      armIdleTimer();
    }
  };
  const reject = (count: number): void => {
    if (finished || count <= 0) return;
    expected = Math.max(0, expected - count);
    checkDrained();
  };

  const next = (): Promise<T | undefined> => {
    if (finished) return Promise.resolve(undefined);
    const head = pending.shift();
    if (head !== undefined) {
      checkDrained();
      return Promise.resolve(head);
    }
    return new Promise<T | undefined>((resolve) => waiters.push(resolve));
  };

  const queue: SessionQueue<T> = {
    enqueue,
    reject,
    next,
    done,
    get arrived() {
      return arrived;
    },
    get expected() {
      return expected;
    },
    abort: () => finish("aborted"),
    dispose: () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };

  // Degenerate case: nothing expected - drained immediately.
  if (expected <= 0) finish("drained");

  return queue;
}

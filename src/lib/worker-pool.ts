/**
 * Shared worker pool for parallel API processing.
 *
 * A fixed number of workers drain a task queue; each worker is pinned to
 * its own llama.cpp slot (slotId = worker index) so its requests reuse
 * the same slot's KV cache. Workers stop picking up new tasks once the
 * optional abort signal fires (in-flight work is allowed to finish).
 */

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

/**
 * Process all tasks with at most `concurrency` parallel workers.
 *
 * @param tasks Tasks to process (drained in queue order).
 * @param concurrency Max parallel workers (clamped to the task count).
 * @param worker Async work for one task; receives the task and the
 *               worker's stable slot id (0-based).
 * @param signal Optional abort signal that stops new work from starting.
 */
export async function runWorkerPool<T>(
  tasks: T[],
  concurrency: number,
  worker: (task: T, slotId: number) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  if (tasks.length === 0) return;

  const workerCount = Math.min(concurrency, tasks.length);
  const queue = [...tasks];

  async function processNext(slotId: number): Promise<void> {
    while (queue.length > 0 && !signal?.aborted) {
      const task = queue.shift()!;
      await worker(task, slotId);
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, (_, workerIndex) => processNext(workerIndex))
  );
}

// ---------------------------------------------------------------------------
// Streaming pool (chunked uploads)
// ---------------------------------------------------------------------------

/**
 * Drain a SessionQueue with at most `concurrency` parallel workers.
 * Streaming variant of runWorkerPool: items arrive incrementally (as
 * upload chunks are received) and workers pull them via queue.next()
 * instead of consuming a pre-built array. Workers stop pulling once the
 * queue closes (drained / timed out / aborted) or the signal fires;
 * in-flight work is allowed to finish.
 *
 * @param queue The queue fed by arriving chunks.
 * @param concurrency Max parallel workers.
 * @param worker Async work for one item; receives the item and the
 *                worker's stable slot id (0-based).
 * @param signal Optional abort signal that stops new work from starting.
 */
export async function runWorkerPoolStreaming<T>(
  queue: {
    next: () => Promise<T | undefined>;
    done: Promise<string>;
    expected: number;
    abort?: () => void;
  },
  concurrency: number,
  worker: (item: T, slotId: number) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) return;

  const workerCount = Math.max(1, Math.min(concurrency, queue.expected));

  // Signal abort closes the queue so workers blocked in next() unblock.
  const onSignalAbort = (): void => queue.abort?.();
  signal?.addEventListener("abort", onSignalAbort, { once: true });

  async function processNext(slotId: number): Promise<void> {
    for (;;) {
      if (signal?.aborted) return;
      const item = await queue.next();
      if (item === undefined) return; // queue closed
      await worker(item, slotId);
    }
  }

  const workers = Promise.all(
    Array.from({ length: workerCount }, (_, workerIndex) => processNext(workerIndex))
  );

  try {
    // The queue may end via timeout/abort without workers draining it; wait
    // for both so the caller can inspect the final outcome.
    await Promise.all([workers, queue.done]);
  } finally {
    signal?.removeEventListener("abort", onSignalAbort);
  }
}

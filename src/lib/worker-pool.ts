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

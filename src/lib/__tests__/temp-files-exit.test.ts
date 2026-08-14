/**
 * Data-safety test: temp-files must NOT delete session directories on
 * process exit. A Docker rebuild (docker compose up -d --build) restarts
 * the app process, and wiping unfinished or not-yet-downloaded results
 * at that point destroys user data. Stale-session cleanup via the
 * sessions.json index + 30-minute TTL already handles disk hygiene.
 *
 * We assert the module registers no "exit" listener at import time.
 */

import { describe, it, expect, beforeAll } from "bun:test";

let listenersBefore: number;

beforeAll(() => {
  listenersBefore = process.listenerCount("exit");
});

describe("temp-files process exit behavior", () => {
  it("does not register a process exit handler", async () => {
    const before = process.listenerCount("exit");
    await import("@/lib/temp-files");
    const after = process.listenerCount("exit");

    expect(after).toBe(before);
  });
});

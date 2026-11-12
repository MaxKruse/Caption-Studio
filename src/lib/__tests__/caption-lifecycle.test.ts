/**
 * Tests for the per-image captioning lifecycle (caption-lifecycle.ts).
 *
 * This is the single source of truth for per-image states + transitions,
 * used by all three mode SSE handlers. The invariants tested here are the
 * ones the UI relies on:
 *   - terminal states (completed/failed) are absorbing
 *   - finalize never overwrites a terminal row
 *   - for Krea 2, `status` always equals statusForPhase(imagePhase)
 */

import { describe, it, expect } from "bun:test";
import {
  applyImageEvent,
  applyKrea2Event,
  statusForPhase,
  type CaptionRow,
  type Krea2CaptionRow,
} from "@/lib/caption-lifecycle";

function baseRow(over: Partial<CaptionRow> = {}): CaptionRow {
  return { status: "queued", ...over };
}

function krea2Row(over: Partial<Krea2CaptionRow> = {}): Krea2CaptionRow {
  return { status: "queued", imagePhase: "idle", ...over };
}

// ---------------------------------------------------------------------------
// Base machine (For Anima, MOSS)
// ---------------------------------------------------------------------------

describe("applyImageEvent (base machine)", () => {
  it("moves queued -> processing on start and clears partials", () => {
    const row = baseRow({ status: "queued", partialCaption: "stale", partialReasoning: "stale" });
    const next = applyImageEvent(row, { kind: "start" });
    expect(next.status).toBe("processing");
    expect(next.partialCaption).toBeUndefined();
    expect(next.partialReasoning).toBeUndefined();
  });

  it("ignores a start that is not from queued (already started / terminal)", () => {
    expect(applyImageEvent(baseRow({ status: "processing" }), { kind: "start" }).status).toBe("processing");
    expect(applyImageEvent(baseRow({ status: "failed" }), { kind: "start" }).status).toBe("failed");
  });

  it("moves processing -> completed on a successful complete", () => {
    const next = applyImageEvent(baseRow({ status: "processing" }), { kind: "complete", status: "completed" });
    expect(next.status).toBe("completed");
  });

  it("moves queued -> failed for a rejected image that never started", () => {
    const next = applyImageEvent(baseRow({ status: "queued" }), { kind: "complete", status: "failed", error: "bad format" });
    expect(next.status).toBe("failed");
    expect(next.error).toBe("bad format");
  });

  it("complete clears partials so the final caption wins the display", () => {
    const row = baseRow({ status: "processing", partialCaption: "partial", partialReasoning: "partial" });
    const next = applyImageEvent(row, { kind: "complete", status: "completed" });
    expect(next.partialCaption).toBeUndefined();
    expect(next.partialReasoning).toBeUndefined();
  });

  it("terminal states are absorbing: a late complete is ignored", () => {
    const done = baseRow({ status: "completed" });
    expect(applyImageEvent(done, { kind: "complete", status: "failed", error: "late" })).toEqual(done);
    const failed = baseRow({ status: "failed", error: "original" });
    expect(applyImageEvent(failed, { kind: "complete", status: "completed" })).toEqual(failed);
  });

  it("finalize fails queued/processing rows with the reason and clears partials", () => {
    const queued = applyImageEvent(baseRow({ status: "queued" }), { kind: "finalize", reason: "Stopped by user" });
    expect(queued).toMatchObject({ status: "failed", error: "Stopped by user", partialCaption: undefined });
    const processing = applyImageEvent(baseRow({ status: "processing" }), { kind: "finalize", reason: "stream ended" });
    expect(processing.status).toBe("failed");
    expect(processing.error).toBe("stream ended");
  });

  it("finalize is absorbing: it never overwrites a terminal row", () => {
    const done = baseRow({ status: "completed" });
    expect(applyImageEvent(done, { kind: "finalize", reason: "late" })).toEqual(done);
    const failed = baseRow({ status: "failed", error: "real error" });
    expect(applyImageEvent(failed, { kind: "finalize", reason: "late" })).toEqual(failed);
  });
});

// ---------------------------------------------------------------------------
// Krea 2 machine (3-phase pipeline)
// ---------------------------------------------------------------------------

describe("statusForPhase", () => {
  it("maps each pipeline phase to exactly one status", () => {
    expect(statusForPhase("idle")).toBe("queued");
    expect(statusForPhase("captioning")).toBe("processing");
    expect(statusForPhase("refining")).toBe("processing");
    expect(statusForPhase("distilling")).toBe("processing");
    expect(statusForPhase("completed")).toBe("completed");
    expect(statusForPhase("failed")).toBe("failed");
  });
});

describe("applyKrea2Event (Krea 2 machine)", () => {
  it("moves idle -> captioning on start", () => {
    const next = applyKrea2Event(krea2Row(), { kind: "start" });
    expect(next.imagePhase).toBe("captioning");
    expect(next.status).toBe("processing");
  });

  it("advances through phase events and clears partials", () => {
    let row = applyKrea2Event(krea2Row(), { kind: "start" });
    row = { ...row, partialCaption: "phase text" };
    row = applyKrea2Event(row, { kind: "phase", phase: "refining" });
    expect(row.imagePhase).toBe("refining");
    expect(row.status).toBe("processing");
    expect(row.partialCaption).toBeUndefined();
    row = applyKrea2Event(row, { kind: "phase", phase: "distilling" });
    expect(row.imagePhase).toBe("distilling");
    expect(row.status).toBe("processing");
  });

  it("keeps the image processing after a successful phase 1/2 (not prematurely completed)", () => {
    let row = applyKrea2Event(krea2Row(), { kind: "start" });
    row = applyKrea2Event(row, { kind: "phase-complete", phase: 1, status: "completed" });
    expect(row.imagePhase).toBe("captioning");
    expect(row.status).toBe("processing");
    row = applyKrea2Event(row, { kind: "phase", phase: "refining" });
    row = applyKrea2Event(row, { kind: "phase-complete", phase: 2, status: "completed" });
    expect(row.imagePhase).toBe("refining");
    expect(row.status).toBe("processing");
  });

  it("reaches completed only after a successful phase 3", () => {
    let row = applyKrea2Event(krea2Row(), { kind: "start" });
    row = applyKrea2Event(row, { kind: "phase-complete", phase: 3, status: "completed" });
    expect(row.imagePhase).toBe("completed");
    expect(row.status).toBe("completed");
  });

  it("moves to failed on a failed phase-complete and records the error", () => {
    let row = applyKrea2Event(krea2Row(), { kind: "start" });
    row = applyKrea2Event(row, { kind: "phase", phase: "refining" });
    row = applyKrea2Event(row, { kind: "phase-complete", phase: 2, status: "failed", error: "boom" });
    expect(row.imagePhase).toBe("failed");
    expect(row.status).toBe("failed");
    expect(row.error).toBe("boom");
  });

  it("terminal states are absorbing: late events are ignored", () => {
    const done = krea2Row({ status: "completed", imagePhase: "completed" });
    expect(applyKrea2Event(done, { kind: "phase", phase: "refining" })).toEqual(done);
    expect(applyKrea2Event(done, { kind: "phase-complete", phase: 3, status: "failed" })).toEqual(done);
    expect(applyKrea2Event(done, { kind: "finalize", reason: "late" })).toEqual(done);
  });

  it("finalize fails non-terminal rows and leaves terminal rows alone", () => {
    const processing = krea2Row({ status: "processing", imagePhase: "distilling" });
    expect(applyKrea2Event(processing, { kind: "finalize", reason: "Stopped by user" })).toMatchObject({
      status: "failed",
      imagePhase: "failed",
      error: "Stopped by user",
    });
    const failed = krea2Row({ status: "failed", imagePhase: "failed", error: "real" });
    expect(applyKrea2Event(failed, { kind: "finalize", reason: "late" })).toEqual(failed);
  });

  it("keeps status === statusForPhase(imagePhase) across the full happy path", () => {
    let row = krea2Row();
    const seq = [
      { kind: "start" },
      { kind: "phase", phase: "captioning" },
      { kind: "phase-complete", phase: 1, status: "completed" },
      { kind: "phase", phase: "refining" },
      { kind: "phase-complete", phase: 2, status: "completed" },
      { kind: "phase", phase: "distilling" },
      { kind: "phase-complete", phase: 3, status: "completed" },
    ] as const;
    for (const ev of seq) {
      row = applyKrea2Event(row, ev);
      expect(row.status).toBe(statusForPhase(row.imagePhase));
    }
    expect(row.imagePhase).toBe("completed");
    expect(row.status).toBe("completed");
  });
});

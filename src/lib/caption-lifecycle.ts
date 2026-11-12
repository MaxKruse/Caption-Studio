/**
 * Per-image captioning lifecycle: the single source of truth for the
 * per-image states and their transitions.
 *
 * Every mode's client SSE handler and the test suite go through these
 * transition functions, so the valid moves are declared in exactly one
 * place. The server routes are the *producers* of the events (they call
 * sendEvent with the same vocabulary); the client is the *consumer* that
 * applies them via these functions.
 *
 * Two machines:
 *
 *   Base (For Anima, MOSS) - one call per image:
 *       queued --start--> processing --complete--> completed | failed
 *
 *   Krea 2 - a 3-phase pipeline per image. `imagePhase` is the single
 *   source of truth for pipeline position and `status` is DERIVED from it
 *   (statusForPhase), so the two fields can never disagree:
 *       idle --start--> captioning --phase--> refining --phase--> distilling
 *            --phase-complete(3, ok)--> completed   |   (any failure)--> failed
 *
 * In both machines the terminal states (completed / failed) are absorbing:
 * a late event after completion is ignored, and finalize never overwrites a
 * terminal row.
 */

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/** The shared per-image lifecycle status (a subset of CaptionResult). */
export type ImageStatus = "queued" | "processing" | "completed" | "failed";

/** Krea 2 pipeline position. `status` is always statusForPhase(this). */
export type Krea2ImagePhase =
  | "idle"
  | "captioning"
  | "refining"
  | "distilling"
  | "completed"
  | "failed";

/** The per-image fields the lifecycle manages (a subset of CaptionResult). */
export interface CaptionRow {
  status: ImageStatus;
  error?: string;
  partialCaption?: string;
  partialReasoning?: string;
}

/** A Krea 2 row: the base fields plus the pipeline phase. */
export interface Krea2CaptionRow extends CaptionRow {
  imagePhase: Krea2ImagePhase;
}

// ---------------------------------------------------------------------------
// Events (normalized, decoupled from the raw SSE payload shape)
// ---------------------------------------------------------------------------

export type ImageEvent =
  | { kind: "start" }
  | { kind: "complete"; status: "completed" | "failed"; error?: string }
  | { kind: "finalize"; reason: string };

export type Krea2Event =
  | { kind: "start" }
  | { kind: "phase"; phase: "captioning" | "refining" | "distilling" }
  | { kind: "phase-complete"; phase: 1 | 2 | 3; status: "completed" | "failed"; error?: string }
  | { kind: "finalize"; reason: string };

// ---------------------------------------------------------------------------
// Derivation + helpers
// ---------------------------------------------------------------------------

/**
 * The one place that decides which status a Krea 2 pipeline phase maps to.
 * `applyKrea2Event` always sets `status = statusForPhase(imagePhase)`, so
 * the two fields are consistent by construction.
 */
export function statusForPhase(phase: Krea2ImagePhase): ImageStatus {
  switch (phase) {
    case "idle":
      return "queued";
    case "captioning":
    case "refining":
    case "distilling":
      return "processing";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
  }
}

const isTerminal = (status: ImageStatus): boolean =>
  status === "completed" || status === "failed";

const clearPartials: Pick<CaptionRow, "partialCaption" | "partialReasoning"> = {
  partialCaption: undefined,
  partialReasoning: undefined,
};

// ---------------------------------------------------------------------------
// Base machine (For Anima, MOSS)
// ---------------------------------------------------------------------------

/**
 * Apply one event to a base per-image row. Returns a new row (React
 * friendly); extra fields (name, caption, token stats, ...) are preserved.
 */
export function applyImageEvent<T extends CaptionRow>(row: T, event: ImageEvent): T {
  switch (event.kind) {
    case "start":
      // Only the first start matters; ignore repeats and late starts.
      if (row.status !== "queued") return row;
      return { ...row, status: "processing", ...clearPartials };
    case "complete":
      // Terminal states are absorbing.
      if (isTerminal(row.status)) return row;
      return { ...row, status: event.status, error: event.error, ...clearPartials };
    case "finalize":
      // Stream ended: fail anything not yet terminal, keep terminal rows.
      if (isTerminal(row.status)) return row;
      return { ...row, status: "failed", error: event.reason, ...clearPartials };
  }
}

// ---------------------------------------------------------------------------
// Krea 2 machine (3-phase pipeline)
// ---------------------------------------------------------------------------

/**
 * Apply one event to a Krea 2 per-image row. `status` is always kept equal
 * to statusForPhase(imagePhase), so the two can never diverge.
 */
export function applyKrea2Event<T extends Krea2CaptionRow>(row: T, event: Krea2Event): T {
  switch (event.kind) {
    case "start":
      // Start is only meaningful from idle; a late/duplicate start is a no-op.
      if (row.imagePhase !== "idle") return row;
      return { ...row, imagePhase: "captioning", status: "processing" };

    case "phase": {
      if (isTerminal(statusForPhase(row.imagePhase))) return row;
      return {
        ...row,
        imagePhase: event.phase,
        status: statusForPhase(event.phase),
        ...clearPartials,
      };
    }

    case "phase-complete": {
      if (isTerminal(statusForPhase(row.imagePhase))) return row;
      // A failure is terminal at any phase. A success completes the image
      // only after phase 3; phases 1 and 2 keep the image "processing" until
      // the next `phase` event advances it.
      const phase: Krea2ImagePhase =
        event.status === "failed" ? "failed" : event.phase === 3 ? "completed" : row.imagePhase;
      return {
        ...row,
        imagePhase: phase,
        status: statusForPhase(phase),
        error: event.error,
        ...clearPartials,
      };
    }

    case "finalize": {
      if (isTerminal(statusForPhase(row.imagePhase))) return row;
      return {
        ...row,
        imagePhase: "failed",
        status: "failed",
        error: event.reason,
        ...clearPartials,
      };
    }
  }
}

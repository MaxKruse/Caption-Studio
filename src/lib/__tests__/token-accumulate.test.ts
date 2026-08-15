/**
 * Tests for applyTokenDelta: accumulates delta-only SSE token events
 * into per-image partial caption/reasoning state.
 */

import { describe, it, expect } from "bun:test";
import { applyTokenDelta, type PartialState } from "@/lib/token-accumulate";

describe("applyTokenDelta", () => {
  it("appends a caption delta to an empty partial caption", () => {
    const empty: PartialState = {};
    const result = applyTokenDelta(empty, { type: "caption", content: "Hel" });
    expect(result.partialCaption).toBe("Hel");
    expect(result.partialReasoning).toBeUndefined();
  });

  it("appends subsequent caption deltas in order", () => {
    let state: PartialState = { partialCaption: undefined, partialReasoning: undefined };
    state = applyTokenDelta(state, { type: "caption", content: "Hel" });
    state = applyTokenDelta(state, { type: "caption", content: "lo" });
    expect(state.partialCaption).toBe("Hello");
  });

  it("accumulates reasoning deltas separately from caption deltas", () => {
    let state: PartialState = { partialCaption: undefined, partialReasoning: undefined };
    state = applyTokenDelta(state, { type: "reasoning", content: "think" });
    state = applyTokenDelta(state, { type: "caption", content: "Hi" });
    state = applyTokenDelta(state, { type: "reasoning", content: "ing" });
    expect(state.partialReasoning).toBe("thinking");
    expect(state.partialCaption).toBe("Hi");
  });

  it("returns the state unchanged fields when appending to the other channel", () => {
    const state: PartialState = { partialCaption: "done", partialReasoning: undefined };
    const result = applyTokenDelta(state, { type: "reasoning", content: "r" });
    expect(result.partialCaption).toBe("done");
    expect(result.partialReasoning).toBe("r");
  });
});

/**
 * Tests for the activeSessions registry: shared session tracking
 * for explicit abort across the caption and detection routes.
 */

import { describe, it, expect } from "bun:test";
import {
  activeSessions,
  registerSession,
  unregisterSession,
  abortSession,
  getSession,
  clearAll,
} from "@/lib/session-registry";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("activeSessions registry", () => {
  it("should clear before each test", () => {
    clearAll();
    expect(activeSessions.size).toBe(0);
  });

  describe("registerSession", () => {
    it("stores abort controller for a session", () => {
      clearAll();
      const ac = new AbortController();
      registerSession("session-1", ac);
      expect(activeSessions.size).toBe(1);
      expect(getSession("session-1")).toBe(ac);
    });

    it("overwrites existing session with same ID", () => {
      clearAll();
      const ac1 = new AbortController();
      const ac2 = new AbortController();
      registerSession("session-1", ac1);
      registerSession("session-1", ac2);
      expect(activeSessions.size).toBe(1);
      expect(getSession("session-1")).toBe(ac2);
    });

    it("stores multiple sessions independently", () => {
      clearAll();
      const ac1 = new AbortController();
      const ac2 = new AbortController();
      registerSession("session-1", ac1);
      registerSession("session-2", ac2);
      expect(activeSessions.size).toBe(2);
      expect(getSession("session-1")).toBe(ac1);
      expect(getSession("session-2")).toBe(ac2);
    });
  });

  describe("unregisterSession", () => {
    it("removes a session", () => {
      clearAll();
      const ac = new AbortController();
      registerSession("session-1", ac);
      unregisterSession("session-1");
      expect(activeSessions.size).toBe(0);
      expect(getSession("session-1")).toBeUndefined();
    });

    it("is a no-op for unknown sessions", () => {
      clearAll();
      unregisterSession("nonexistent");
      expect(activeSessions.size).toBe(0);
    });
  });

  describe("abortSession", () => {
    it("aborts and removes the session", () => {
      clearAll();
      const ac = new AbortController();
      registerSession("session-1", ac);
      const result = abortSession("session-1");
      expect(result).toBe(true);
      expect(ac.signal.aborted).toBe(true);
      expect(activeSessions.size).toBe(0);
    });

    it("returns false for unknown sessions", () => {
      clearAll();
      const result = abortSession("nonexistent");
      expect(result).toBe(false);
      expect(activeSessions.size).toBe(0);
    });

    it("does not abort other sessions", () => {
      clearAll();
      const ac1 = new AbortController();
      const ac2 = new AbortController();
      registerSession("session-1", ac1);
      registerSession("session-2", ac2);
      abortSession("session-1");
      expect(ac1.signal.aborted).toBe(true);
      expect(ac2.signal.aborted).toBe(false);
      expect(activeSessions.size).toBe(1);
      expect(getSession("session-2")).toBe(ac2);
    });
  });

  describe("integration: full lifecycle", () => {
    it("register -> explicit abort via abortSession", () => {
      clearAll();
      const ac = new AbortController();
      registerSession("test-session", ac);

      const result = abortSession("test-session");
      expect(result).toBe(true);
      expect(ac.signal.aborted).toBe(true);
      expect(activeSessions.size).toBe(0);
    });

  });
});

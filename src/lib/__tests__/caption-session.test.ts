/**
 * Tests for the activeSessions registry pattern.
 * This pattern is duplicated across all 4 caption route files.
 * Tests the shared session tracking for explicit abort.
 */

import { describe, it, expect } from "bun:test";
import {
  activeSessions,
  registerSession,
  unregisterSession,
  abortSession,
  getSession,
  cleanupAbortedSessions,
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

  describe("cleanupAbortedSessions", () => {
    it("removes sessions that have been aborted externally", () => {
      clearAll();
      const ac1 = new AbortController();
      const ac2 = new AbortController();
      registerSession("session-1", ac1);
      registerSession("session-2", ac2);

      // Abort session-1 externally (simulating request.signal abort)
      ac1.abort();

      cleanupAbortedSessions();
      expect(activeSessions.size).toBe(1);
      expect(getSession("session-1")).toBeUndefined();
      expect(getSession("session-2")).toBe(ac2);
    });

    it("is a no-op when no sessions are aborted", () => {
      clearAll();
      const ac = new AbortController();
      registerSession("session-1", ac);
      cleanupAbortedSessions();
      expect(activeSessions.size).toBe(1);
    });

    it("handles empty registry", () => {
      clearAll();
      cleanupAbortedSessions();
      expect(activeSessions.size).toBe(0);
    });
  });

  describe("integration: full lifecycle", () => {
    it("register -> abort -> cleanup flow", () => {
      clearAll();
      const ac = new AbortController();
      registerSession("test-session", ac);
      expect(activeSessions.size).toBe(1);

      // Simulate request disconnect
      ac.abort();
      expect(getSession("test-session")).toBe(ac); // still registered

      // Cleanup interval runs
      cleanupAbortedSessions();
      expect(activeSessions.size).toBe(0);
    });

    it("register -> explicit abort via abortSession", () => {
      clearAll();
      const ac = new AbortController();
      registerSession("test-session", ac);

      const result = abortSession("test-session");
      expect(result).toBe(true);
      expect(ac.signal.aborted).toBe(true);
      expect(activeSessions.size).toBe(0);
    });

    it("multiple sessions with mixed abort patterns", () => {
      clearAll();
      const ac1 = new AbortController();
      const ac2 = new AbortController();
      const ac3 = new AbortController();

      registerSession("a", ac1);
      registerSession("b", ac2);
      registerSession("c", ac3);
      expect(activeSessions.size).toBe(3);

      // Explicit abort of "a"
      abortSession("a");
      expect(activeSessions.size).toBe(2);

      // External abort of "b" (request disconnect)
      ac2.abort();
      expect(activeSessions.size).toBe(2); // still registered

      // Cleanup removes "b"
      cleanupAbortedSessions();
      expect(activeSessions.size).toBe(1);
      expect(getSession("c")).toBe(ac3);
    });
  });
});

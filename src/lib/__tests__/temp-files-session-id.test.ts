import { describe, it, expect } from "bun:test";
import fsp from "fs/promises";
import { createSession, deleteSession } from "@/lib/temp-files";

// ---------------------------------------------------------------------------
// createSession with a client-provided id
//
// Chunked uploads let the client name the session (it generates a UUID so
// it knows the id before the stream opens). The id becomes a directory
// name, so anything that is not a strict UUIDv4 must be rejected.
// ---------------------------------------------------------------------------

describe("createSession with client-provided id", () => {
  it("creates a session with a valid client UUID", async () => {
    const id = crypto.randomUUID();
    const session = await createSession(id);
    expect(session.id).toBe(id);
    expect(session.dir).toContain(id);
    await expect(fsp.access(session.dir)).resolves.toBeNull();
    await deleteSession(id);
  });

  it("still generates a random UUID when no id is given", async () => {
    const session = await createSession();
    expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await deleteSession(session.id);
  });

  it("rejects path-traversal ids", async () => {
    await expect(createSession("../evil")).rejects.toThrow();
    await expect(createSession("../../tmp/escape")).rejects.toThrow();
    await expect(createSession("..")).rejects.toThrow();
  });

  it("rejects non-UUID ids", async () => {
    await expect(createSession("abc def.png")).rejects.toThrow();
    await expect(createSession("session-123")).rejects.toThrow();
    await expect(createSession("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).rejects.toThrow();
  });

  it("rejects non-v4 UUID shapes", async () => {
    // Valid UUID layout but version nibble is not 4
    await expect(createSession("11111111-1111-2111-8111-111111111111")).rejects.toThrow();
  });

  it("rejects an id whose session directory already exists", async () => {
    const id = crypto.randomUUID();
    await createSession(id);
    await expect(createSession(id)).rejects.toThrow();
    await deleteSession(id);
  });
});

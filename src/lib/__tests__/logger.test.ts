import { describe, it, expect } from "bun:test";
import { generateRequestId, logStructured } from "@/lib/logger";

describe("logger", () => {
  it("generates request id with correct format", () => {
    const id = generateRequestId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    // UUID v4 like format
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("generates unique ids", () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    expect(id1).not.toBe(id2);
  });

  it("logStructured outputs JSON", () => {
    const originalLog = console.log;
    let output = "";
    console.log = (msg) => { output = msg; };
    try {
      logStructured("info", "test message", { key: "value" });
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("test message");
      expect(parsed.meta.key).toBe("value");
      expect(parsed.timestamp).toBeDefined();
    } finally {
      console.log = originalLog;
    }
  });
});
